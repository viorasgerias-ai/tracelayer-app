"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

export function Header() {
  const router = useRouter();
  const { user, loading, error: authError, signInWithGoogle, signOutUser } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setError("");
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Falha ao entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setError("");
    setBusy(true);
    try {
      await signOutUser();
      await apiFetch("/api/logout", { method: "POST" }).catch(() => undefined);
      router.replace("/login/");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Falha ao sair.");
    } finally {
      setBusy(false);
    }
  }

  const message = error || authError;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="space-between">
        <div>
          <strong>A Força</strong>
          <div className="muted" style={{ marginTop: 4 }}>
            Decisão estruturada + plano + trilha auditável
          </div>
        </div>
        <div className="row">
          {user ? <span className="muted">{user.displayName || user.email}</span> : null}
          <Link className="button secondary" href="/dashboard/">
            Dashboard
          </Link>
          {user ? (
            <button className="button danger" type="button" onClick={logout} disabled={busy || loading}>
              Sair
            </button>
          ) : (
            <button className="button" type="button" onClick={signIn} disabled={busy || loading}>
              Entrar com Google
            </button>
          )}
        </div>
      </div>
      {message ? <div role="alert" className="muted">{message}</div> : null}
    </div>
  );
}
