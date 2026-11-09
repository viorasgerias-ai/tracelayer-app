type AISetupCardProps = {
  compact?: boolean;
};

const AI_SETUP_BORDER = "1px solid rgba(255, 158, 176, 0.35)";
const AI_SETUP_BACKGROUND = "rgba(255, 158, 176, 0.08)";

export function AISetupCard({ compact = false }: AISetupCardProps) {
  return (
    <div
      className="card"
      style={{
        marginBottom: compact ? 0 : 16,
        border: AI_SETUP_BORDER,
        background: AI_SETUP_BACKGROUND
      }}
    >
      <div className="badge" style={{ marginBottom: 12 }}>
        Provedor de IA não configurado
      </div>
      <strong>Configure o endpoint em AI_API_URL para liberar as gerações.</strong>
      <div className="muted" style={{ marginTop: 8 }}>
        Preencha <code>.env.local</code> com <code>AI_API_URL</code> e, se necessário,
        <code>AI_API_KEY</code>. Reinicie o servidor caso ele já esteja em execução.
      </div>
    </div>
  );
}
