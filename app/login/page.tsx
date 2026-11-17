"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password")
        })
      });
      router.replace("/dashboard/");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Falha ao entrar.");
    }
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 520, paddingTop: 72 }}>
        <form className="card grid" onSubmit={submit}>
          <div>
            <h1 style={{ marginTop: 0 }}>Entrar</h1>
            <p className="muted">
              Acesse o workspace de decisão estruturada e trilhas auditáveis.
            </p>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" name="email" required />
          </div>
          <div>
            <label className="label">Senha</label>
            <input className="input" type="password" name="password" required />
          </div>
          {error ? <div role="alert">{error}</div> : null}
          <button className="button" type="submit">Entrar no dashboard</button>
        </form>
      </div>
    </main>
  );
}
