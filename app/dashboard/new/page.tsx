"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { apiFetch, explainApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { assertDecisionRequest, saveDecisionRecord, type DecisionRequestFields } from "@/lib/firestore";
import { explainFirebaseError } from "@/lib/firebase";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState("");

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreatedId("");
    if (!user) {
      setError("Entre para salvar o caso.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const values: DecisionRequestFields = {
      name: field(formData, "name"),
      product: field(formData, "product"),
      audience: field(formData, "audience"),
      objective: field(formData, "objective"),
      offer: field(formData, "offer"),
      channel: field(formData, "channel"),
      objections: field(formData, "objections"),
      stage: field(formData, "stage")
    };
    try {
      assertDecisionRequest(values);
      const { project } = await apiFetch<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(values)
      });
      try {
        await saveDecisionRecord(user, project.id, values);
      } catch (persistError) {
        setCreatedId(project.id);
        setError(explainFirebaseError(persistError, "O caso foi criado, mas não foi salvo na sua conta."));
        return;
      }
      router.push(`/dashboard/project/?id=${encodeURIComponent(project.id)}`);
    } catch (createError) {
      setError(explainApiError(createError, "Falha ao salvar o caso."));
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
          {createdId ? (
            <Link className="button secondary" href={`/dashboard/project/?id=${encodeURIComponent(createdId)}`}>
              Abrir caso
            </Link>
          ) : null}
          <button className="button" type="submit">Salvar caso</button>
        </form>
      </div>
    </main>
  );
}
