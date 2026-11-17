"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { AISetupCard } from "@/components/AISetupCard";
import { ResultCard } from "@/components/ResultCard";
import { GenerateButton } from "./GenerateButton";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { MarketingOutput } from "@/lib/types";

type ProjectDetails = {
  id: string;
  name: string;
  product: string;
  audience: string;
  objective: string;
  offer: string | null;
  channel: string | null;
  objections: string | null;
  stage: string | null;
  createdAt: string;
  runs: {
    id: string;
    outputJson: string | null;
    outputText: string | null;
    model: string;
    status: string;
    createdAt: string;
    responseId: string | null;
  }[];
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [projectId, setProjectId] = useState("");
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      router.replace("/dashboard/");
      return;
    }
    setProjectId(id);
    Promise.all([
      apiFetch<{ project: ProjectDetails }>(`/api/projects/${encodeURIComponent(id)}`),
      apiFetch<{ configured: boolean }>("/api/ai/health")
    ]).then(([result, health]) => {
      setProject(result.project);
      setProviderConfigured(health.configured);
    }).catch((loadError: unknown) => {
      if (loadError instanceof Error && loadError.message === "Não autenticado.") {
        router.replace("/login/");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o projeto.");
    });
  }, [router]);

  if (!project) {
    return <main className="page"><div className="container">{error || "Carregando..."}</div></main>;
  }

  const latestRun = project.runs[0];
  let parsedOutput: MarketingOutput | null = null;
  try {
    parsedOutput = latestRun?.outputJson
      ? JSON.parse(latestRun.outputJson) as MarketingOutput
      : null;
  } catch {
    parsedOutput = null;
  }

  return (
    <main className="page">
      <div className="container">
        <Header />
        {error ? <div className="card">{error}</div> : null}
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div className="card">
            <div className="space-between">
              <div>
                <h1 style={{ marginTop: 0, marginBottom: 8 }}>{project.name}</h1>
                <div className="muted">Criado em {formatDate(project.createdAt)}</div>
              </div>
              <GenerateButton
                projectId={projectId}
                providerConfigured={providerConfigured}
                onGenerated={() => window.location.reload()}
              />
            </div>
            {!providerConfigured ? <AISetupCard compact /> : null}
            <div className="grid" style={{ marginTop: 20 }}>
              <div>
                <div className="label">Contexto ou ativo decisório</div>
                <pre className="output">{project.product}</pre>
              </div>
              <div>
                <div className="label">Partes interessadas</div>
                <pre className="output">{project.audience}</pre>
              </div>
              <div>
                <div className="label">Objetivo</div>
                <pre className="output">{project.objective}</pre>
              </div>
              <div>
                <div className="label">Restrições ou recursos</div>
                <pre className="output">{project.offer || "Não informado"}</pre>
              </div>
              <div>
                <div className="label">Riscos e objeções</div>
                <pre className="output">{project.objections || "Não informado"}</pre>
              </div>
              <div>
                <div className="label">Fase</div>
                <pre className="output">{project.stage || "Não informado"}</pre>
              </div>
            </div>
          </div>
          <div className="grid">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Histórico</h3>
              <div className="grid">
                {project.runs.length === 0 ? (
                  <div className="muted">Nenhuma geração ainda.</div>
                ) : project.runs.map((run) => (
                  <div key={run.id} className="card" style={{ padding: 14 }}>
                    <div className="space-between">
                      <span className="badge">{run.model}</span>
                      <span className="muted">{formatDate(run.createdAt)}</span>
                    </div>
                    <div className="muted" style={{ marginTop: 10 }}>
                      Status: {run.status} • Response ID: {run.responseId || "n/a"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          {parsedOutput ? (
            <ResultCard output={parsedOutput} />
          ) : latestRun?.outputText ? (
            <div className="card">
              <h3>Saída textual</h3>
              <pre className="output">{latestRun.outputText}</pre>
            </div>
          ) : (
            <div className="card">
              <strong>Pronto para gerar.</strong>
              <div className="muted" style={{ marginTop: 8 }}>
                Clique em “Gerar decisão” para criar briefing, fatos, hipóteses, critérios, plano e trilha.
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
