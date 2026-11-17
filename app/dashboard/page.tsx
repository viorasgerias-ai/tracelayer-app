"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { AISetupCard } from "@/components/AISetupCard";
import { formatDate } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

type DashboardData = {
  projects: {
    id: string;
    name: string;
    channel: string | null;
    objective: string;
    createdAt: string;
    runCount: number;
  }[];
  runCount: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [email, setEmail] = useState("");
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<{ email: string }>("/api/session"),
      apiFetch<DashboardData>("/api/projects"),
      apiFetch<{ configured: boolean }>("/api/ai/health")
    ]).then(([session, projects, health]) => {
      setEmail(session.email);
      setData(projects);
      setProviderConfigured(health.configured);
    }).catch((loadError: unknown) => {
      if (loadError instanceof Error && loadError.message === "Não autenticado.") {
        router.replace("/login/");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o painel.");
    });
  }, [router]);

  if (!data) {
    return <main className="page"><div className="container">{error || "Carregando..."}</div></main>;
  }
  const { projects, runCount } = data;

  return (
    <main className="page">
      <div className="container">
        <Header />
        {!providerConfigured ? <AISetupCard /> : null}
        {error ? <div className="card">{error}</div> : null}

        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="muted">Projetos</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{projects.length}</div>
          </div>
          <div className="card">
            <div className="muted">Execuções</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{runCount}</div>
          </div>
          <div className="card">
            <div className="muted">Sessão</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{email}</div>
          </div>
        </div>

        <div className="space-between" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Projetos</h2>
            <div className="muted">Crie o briefing e gere uma decisão rastreável.</div>
          </div>
          <Link href="/dashboard/new/" className="button">
            Novo projeto
          </Link>
        </div>

        <div className="grid">
          {projects.length === 0 ? (
            <div className="card">
              <strong>Sem projetos ainda.</strong>
              <div className="muted" style={{ marginTop: 8 }}>
                Crie o primeiro caso para testar o fluxo de decisão.
              </div>
            </div>
          ) : (
            projects.map((project) => (
              <Link key={project.id} href={`/dashboard/project/?id=${encodeURIComponent(project.id)}`} className="card">
                <div className="space-between">
                  <div>
                    <strong>{project.name}</strong>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {project.channel || "Canal não informado"} • {formatDate(project.createdAt)}
                    </div>
                  </div>
                  <span className="badge">{project.runCount} execuções</span>
                </div>
                <div className="muted" style={{ marginTop: 14 }}>
                  {project.objective}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
