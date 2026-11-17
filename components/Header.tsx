"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function Header() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function logout() {
    setError("");
    try {
      await apiFetch("/api/logout", { method: "POST" });
      router.replace("/login/");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Falha ao sair.");
    }
  }

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
          <Link className="button secondary" href="/dashboard/">
            Dashboard
          </Link>
          <button className="button danger" type="button" onClick={logout}>Sair</button>
        </div>
      </div>
      {error ? <div role="alert" className="muted">{error}</div> : null}
    </div>
  );
}
