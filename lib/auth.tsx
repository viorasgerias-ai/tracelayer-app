"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User
} from "firebase/auth";
import { explainFirebaseError, getFirebaseAuth } from "@/lib/firebase";
import { ensureUserProfile } from "@/lib/firestore";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function firebaseCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const profileUid = useRef<string | null>(null);

  useEffect(() => {
    let auth;
    try {
      auth = getFirebaseAuth();
    } catch (initError) {
      setError(explainFirebaseError(initError, "Falha ao iniciar o Firebase."));
      setLoading(false);
      return;
    }

    let active = true;
    void getRedirectResult(auth).catch((redirectError) => {
      if (!active) return;
      const message = explainFirebaseError(redirectError, "Falha ao entrar.");
      if (message) setError(message);
    });

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!active) return;
      setUser(nextUser);
      setLoading(false);
      if (!nextUser || profileUid.current === nextUser.uid) return;
      void ensureUserProfile(nextUser)
        .then(() => {
          profileUid.current = nextUser.uid;
        })
        .catch((profileError) => {
          if (!active) return;
          setError(explainFirebaseError(profileError, "Falha ao salvar o perfil."));
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError("");
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (signInError) {
      const code = firebaseCode(signInError);
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return;
      }
      if (code === "auth/popup-blocked") {
        await signInWithRedirect(auth, provider);
        return;
      }
      const message = explainFirebaseError(signInError, "Falha ao entrar.");
      setError(message);
      throw new Error(message);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setError("");
    profileUid.current = null;
    try {
      await signOut(getFirebaseAuth());
    } catch (signOutError) {
      const message = explainFirebaseError(signOutError, "Falha ao sair.");
      setError(message);
      throw new Error(message);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, signInWithGoogle, signOutUser }),
    [user, loading, error, signInWithGoogle, signOutUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return value;
}
