"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, error, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard/");
    }
  }, [loading, user, router]);

  async function signIn() {
    setLocalError("");
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (signInError) {
      setLocalError(signInError instanceof Error ? signInError.message : "Falha ao entrar.");
    } finally {
      setBusy(false);
    }
  }

  const message = localError || error;

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 520, paddingTop: 72 }}>
        <div className="card grid">
          <div>
            <h1 style={{ marginTop: 0 }}>Entrar</h1>
            <p className="muted">
              Acesse o workspace de decisão estruturada e trilhas auditáveis.
            </p>
          </div>
          {message ? <div role="alert">{message}</div> : null}
          <button className="button" type="button" onClick={signIn} disabled={loading || busy || Boolean(user)}>
            {busy ? "Entrando..." : "Entrar com Google"}
          </button>
        </div>
      </div>
    </main>
  );
}
