"use client";

import { useState } from "react";
import { apiFetch, explainApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { explainFirebaseError } from "@/lib/firebase";
import { saveDecisionRecord, type DecisionRequestFields } from "@/lib/firestore";
import type { MarketingOutput } from "@/lib/types";

type GenerateButtonProps = {
  projectId: string;
  request: DecisionRequestFields;
  providerConfigured: boolean;
  onGenerated: () => void;
};

export function GenerateButton({ projectId, request, providerConfigured, onGenerated }: GenerateButtonProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const providerHintId = `provider-hint-${projectId}`;

  async function generate() {
    if (!user) {
      setError("Entre para gerar uma decisão.");
      return;
    }
    try {
      setLoading(true);
      setError("");

      const generated = await apiFetch<{ runId: string; output: MarketingOutput }>("/api/generate", {
        method: "POST",
        body: JSON.stringify({ projectId })
      });
      try {
        await saveDecisionRecord(user, projectId, {
          ...request,
          runId: generated.runId,
          result: generated.output
        });
      } catch (persistError) {
        setError(explainFirebaseError(persistError, "A decisão foi gerada, mas não foi salva na sua conta."));
        return;
      }

      onGenerated();
    } catch (err) {
      setError(explainApiError(err, "Erro inesperado."));
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
