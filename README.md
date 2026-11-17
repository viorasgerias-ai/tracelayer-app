# TraceLayer — decisões guiadas e trilhas auditáveis

Aplicação de apoio à decisão estruturada. O produto mantém o foco em briefing, fatos, hipóteses, critérios, decisão, plano e trilha auditável; não inclui SDKs de análise de repositórios nem métricas de sinais.

## Arquitetura

- Interface web Next.js exportada como arquivos estáticos.
- Backend Python 3.13.3 em ASGI, organizado para ser adaptado a funções serverless.
- Contrato `DecisionProvider` desacoplado de fornecedores de IA e sem chamadas autenticadas por chave de API.
- Nenhum SDK de nuvem ou configuração Terraform específica de provedor.

A implantação deve encaminhar `/api/*` para `backend.main:app` e servir o frontend estático na mesma origem. A adaptação de implantação é intencionalmente deixada para cada plataforma. Para integração de IA, implemente e registre um `DecisionProvider`; use a identidade gerenciada ou a integração do Secret Manager oferecida pela plataforma para obter credenciais. Não inclua segredos no repositório, no bundle do frontend ou em chamadas configuradas por chaves estáticas.

O SQLite é apenas o armazenamento local inicial. Em produção serverless, implemente e registre um `DecisionRepository` persistente por `configure_repository`; o sistema de arquivos local de funções pode ser efêmero. O limitador de tentativas de login também é local ao processo, portanto a proteção distribuída deve ser configurada na camada de entrada da implantação.

## Configuração local

Use Python 3.13.3 e Node.js 22. Copie `.env.example` para `.env` e preencha as credenciais administrativas e o segredo de sessão por variáveis locais. Em produção, configure esses valores pelo Secret Manager da plataforma.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci
```

Inicie o backend e a interface em terminais separados:

```bash
uvicorn backend.main:app --reload --env-file .env
npm run dev
```

O servidor Next.js encaminha `/api/*` para o backend local durante o desenvolvimento. Em produção, configure o mesmo encaminhamento na camada de implantação para manter frontend e API na mesma origem.

Para gerar os arquivos estáticos da interface:

```bash
npm run build
```

## Contrato de decisão

`backend.main.DecisionProvider` define a única integração necessária para geração. O provedor recebe os dados do caso e retorna o objeto estruturado de decisão; o backend valida o formato, calcula a referência da trilha e persiste a execução. A implementação concreta do provedor e a forma de obter credenciais ficam a cargo da plataforma escolhida.

O endpoint de revisão de código/Advisor SDK foi removido para manter o domínio do produto centrado em decisões guiadas.
