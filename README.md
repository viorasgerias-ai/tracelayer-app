# TraceLayer — decisões guiadas e trilhas auditáveis

Aplicação de apoio à decisão estruturada. O produto mantém o foco em briefing, fatos, hipóteses, critérios, decisão, plano e trilha auditável; não inclui SDKs de análise de repositórios nem métricas de sinais.

## Arquitetura

- Interface web Next.js exportada como arquivos estáticos.
- Login com Google pelo Firebase Auth. O painel de decisão só abre com um usuário autenticado.
- Cada usuário grava o perfil em `users/{uid}` e uma cópia do caso em `users/{uid}/decisions/{decisionId}` no Firestore.
- Backend Python 3.13.3 em ASGI, organizado para ser adaptado a funções serverless e, mais tarde, ao Cloud Run.
- Os endpoints autenticados aceitam o cookie de sessão existente ou, quando `FIREBASE_PROJECT_ID` está definido, um ID token do Firebase no cabeçalho `Authorization: Bearer`.
- A verificação do token usa Application Default Credentials. Não há chave de conta de serviço no repositório.
- Contrato `DecisionProvider` desacoplado de fornecedores de IA e sem chamadas autenticadas por chave de API.
- A configuração do Firebase cobre só regras e índices do Firestore. Não há Hosting nem Cloud Functions neste repositório.

A implantação deve encaminhar `/api/*` para `backend.main:app` e servir o frontend estático na mesma origem. A adaptação de implantação é intencionalmente deixada para cada plataforma. Para integração de IA, implemente e registre um `DecisionProvider`; use a identidade gerenciada ou a integração do Secret Manager oferecida pela plataforma para obter credenciais. Não inclua segredos no repositório, no bundle do frontend ou em chamadas configuradas por chaves estáticas.

O SQLite continua sendo o armazenamento da API. O Firestore guarda a cópia por usuário no navegador. Em produção serverless, implemente e registre um `DecisionRepository` persistente por `configure_repository`; o sistema de arquivos local de funções pode ser efêmero. O limitador de tentativas de login também é local ao processo, portanto a proteção distribuída deve ser configurada na camada de entrada da implantação.

## Configuração local

Use Python 3.13.3 e Node.js 22. Copie `.env.example` para `.env`. As variáveis `NEXT_PUBLIC_FIREBASE_*` já trazem a configuração pública do app Web `compl-p-alpha`. Ajuste o e-mail, a senha e o segredo de sessão administrativos. Em produção, configure esses valores pelo Secret Manager da plataforma.

`FIREBASE_PROJECT_ID` liga a verificação do ID token na API. Sem essa variável, um `Bearer` é recusado e o cookie de sessão continua valendo. Não crie nem versione um JSON de conta de serviço. Na máquina local, as credenciais padrão vêm de:

```bash
gcloud auth application-default login
```

No Cloud Run, a conta de serviço do runtime fornece essas credenciais. Defina apenas `FIREBASE_PROJECT_ID=compl-p-alpha`.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci
```

Publique as regras do Firestore antes de usar a gravação. O banco `(default)` está em modo de produção e, até essa publicação, nega todo acesso. O comando não ativa faturamento, Hosting nem Functions:

```bash
npx -y firebase-tools@latest deploy --only firestore:rules --project compl-p-alpha
```

O domínio `localhost` já está autorizado para o Google Sign-In, junto com `compl-p-alpha.firebaseapp.com` e `compl-p-alpha.web.app`. Se a interface for servida em outro domínio, inclua só o host, sem protocolo e sem porta.

Inicie o backend e a interface em terminais separados. Abra a interface em `http://localhost:3000`. O domínio autorizado do Google Sign-In é `localhost`; `127.0.0.1` não está nessa lista.

```bash
uvicorn backend.main:app --reload --env-file .env
npm run dev
```

O servidor Next.js encaminha `/api/*` para o backend local durante o desenvolvimento. Em produção, configure o mesmo encaminhamento na camada de implantação para manter frontend e API na mesma origem.

Para gerar os arquivos estáticos da interface:

```bash
npm run build
```

As regras em `firestore.rules` são um protótipo para o dono do documento e para o formato da decisão. Revise-as antes de abrir o app para um público amplo.

## Contrato de decisão

`backend.main.DecisionProvider` define a única integração necessária para geração. O provedor recebe os dados do caso e retorna o objeto estruturado de decisão; o backend valida o formato, calcula a referência da trilha e persiste a execução. A implementação concreta do provedor e a forma de obter credenciais ficam a cargo da plataforma escolhida.

O endpoint de revisão de código/Advisor SDK foi removido para manter o domínio do produto centrado em decisões guiadas.
