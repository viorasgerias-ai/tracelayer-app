"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { apiFetch } from "@/lib/api";

export default function NewProjectPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData.entries());
    try {
      const { project } = await apiFetch<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(values)
      });
      router.push(`/dashboard/project/?id=${encodeURIComponent(project.id)}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Falha ao salvar o caso.");
    }
  }

  return (
    <main className="page">
      <div className="container">
        <Header />
        <form className="card grid" onSubmit={createProject}>
          <div>
            <h1 style={{ marginTop: 0 }}>Novo projeto</h1>
            <p className="muted">
              Estruture o briefing decisório. Quanto melhor a entrada, mais auditável fica a saída.
            </p>
          </div>

          <div className="grid-2">
            <div>
              <label className="label">Nome do projeto</label>
              <input className="input" name="name" required />
            </div>
            <div>
              <label className="label">Canal</label>
              <input className="input" name="channel" placeholder="Instagram, LinkedIn, Email..." />
            </div>
          </div>

          <div>
            <label className="label">Contexto ou ativo decisório</label>
            <textarea className="textarea" name="product" required />
          </div>

          <div>
            <label className="label">Partes interessadas</label>
            <textarea className="textarea" name="audience" required />
          </div>

          <div>
            <label className="label">Objetivo</label>
            <textarea className="textarea" name="objective" required />
          </div>

          <div>
            <label className="label">Restrições ou recursos</label>
            <textarea className="textarea" name="offer" />
          </div>

          <div>
            <label className="label">Riscos e objeções</label>
            <textarea className="textarea" name="objections" placeholder="risco operacional, evidência fraca, baixa adoção..." />
          </div>

          <div>
            <label className="label">Fase</label>
            <input className="input" name="stage" placeholder="triagem, validação, decisão, execução..." />
          </div>

          {error ? <div role="alert">{error}</div> : null}
          <button className="button" type="submit">Salvar caso</button>
        </form>
      </div>
    </main>
  );
}
