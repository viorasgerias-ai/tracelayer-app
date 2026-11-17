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
        Provedor de decisão não integrado
      </div>
      <strong>Integre um DecisionProvider para habilitar as decisões.</strong>
      <div className="muted" style={{ marginTop: 8 }}>
        Use as credenciais gerenciadas pela plataforma de implantação. Não configure chaves de API no aplicativo.
      </div>
    </div>
  );
}
