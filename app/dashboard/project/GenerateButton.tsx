"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type GenerateButtonProps = {
  projectId: string;
  providerConfigured: boolean;
  onGenerated: () => void;
};

export function GenerateButton({ projectId, providerConfigured, onGenerated }: GenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const providerHintId = `provider-hint-${projectId}`;

  async function generate() {
    try {
      setLoading(true);
      setError("");

      await apiFetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({ projectId })
      });

      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="row">
        <button
          className="button"
          onClick={generate}
          disabled={loading || !providerConfigured}
          aria-describedby={!providerConfigured ? providerHintId : undefined}
        >
          {loading ? "Gerando..." : "Gerar decisão"}
        </button>
        {error ? <span style={{ color: "#ff9eb0" }}>{error}</span> : null}
      </div>
      {!providerConfigured ? (
        <div id={providerHintId} className="muted" style={{ marginTop: 8 }}>
          Integre um DecisionProvider com as credenciais gerenciadas pela plataforma.
        </div>
      ) : null}
    </div>
  );
}
