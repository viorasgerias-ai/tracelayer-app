import type { User } from "firebase/auth";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import type { DecisionTraceOutput } from "@/lib/types";

export const FIRESTORE_LIMITS = {
  name: 200,
  longText: 8000,
  shortText: 500,
  listItem: 1000,
  list: 20,
  displayName: 200,
  photoUrl: 2048,
  email: 320,
  id: 128,
  runId: 64,
  version: 64,
  hash: 128,
  label: 300,
  resultJson: 400000
} as const;

export type DecisionRequestFields = {
  name: string;
  product: string;
  audience: string;
  objective: string;
  offer: string;
  channel: string;
  objections: string;
  stage: string;
};

export type DecisionRecordInput = DecisionRequestFields & {
  runId?: string;
  result?: DecisionTraceOutput;
};

function fail(label: string): never {
  throw new Error(`Não foi possível salvar ${label}. O valor passa do limite aceito.`);
}

function asText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    fail(label);
  }
  return value;
}

function asStringList(value: unknown, label: string, minCount: number): string[] {
  if (!Array.isArray(value) || value.length < minCount || value.length > FIRESTORE_LIMITS.list) {
    fail(label);
  }
  return value.map((item, index) => asText(item, `${label} ${index + 1}`, 1, FIRESTORE_LIMITS.listItem));
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(label);
  }
  return value as Record<string, unknown>;
}

function oneOf(value: unknown, allowed: readonly string[], label: string): string {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(label);
  }
  return value;
}

const CONFIDENCE = ["baixa", "media", "alta"] as const;
const WEIGHT = ["LOW", "MEDIUM", "HIGH"] as const;

export function assertDecisionRequest(input: DecisionRequestFields): DecisionRequestFields {
  return {
    name: asText(input.name, "o nome do projeto", 1, FIRESTORE_LIMITS.name),
    product: asText(input.product, "o contexto", 1, FIRESTORE_LIMITS.longText),
    audience: asText(input.audience, "as partes interessadas", 1, FIRESTORE_LIMITS.longText),
    objective: asText(input.objective, "o objetivo", 1, FIRESTORE_LIMITS.longText),
    offer: asText(input.offer, "as restrições", 0, FIRESTORE_LIMITS.longText),
    channel: asText(input.channel, "o canal", 0, FIRESTORE_LIMITS.shortText),
    objections: asText(input.objections, "os riscos", 0, FIRESTORE_LIMITS.longText),
    stage: asText(input.stage, "a fase", 0, FIRESTORE_LIMITS.shortText)
  };
}

export function assertDecisionResult(value: unknown): DecisionTraceOutput {
  const result = asRecord(value, "a decisão");
  const briefing = asRecord(result.briefing, "o briefing");
  const facts = asRecord(result.extracao_de_fatos, "a extração de fatos");
  const decision = asRecord(result.decisao, "a decisão");
  const trail = asRecord(result.trilha_auditavel, "a trilha auditável");
  const hypotheses = Array.isArray(result.hipoteses) ? result.hipoteses : fail("as hipóteses");
  const criteria = Array.isArray(result.criterios) ? result.criterios : fail("os critérios");
  const plan = Array.isArray(result.plano) ? result.plano : fail("o plano");

  if (hypotheses.length > FIRESTORE_LIMITS.list) fail("as hipóteses");
  if (criteria.length < 1 || criteria.length > FIRESTORE_LIMITS.list) fail("os critérios");
  if (plan.length < 1 || plan.length > FIRESTORE_LIMITS.list) fail("o plano");

  return {
    briefing: {
      contexto: asText(briefing.contexto, "o contexto do briefing", 1, FIRESTORE_LIMITS.longText),
      objetivo: asText(briefing.objetivo, "o objetivo do briefing", 1, FIRESTORE_LIMITS.longText),
      restricoes: asStringList(briefing.restricoes, "as restrições do briefing", 0),
      partes_interessadas: asStringList(briefing.partes_interessadas, "as partes do briefing", 0)
    },
    extracao_de_fatos: {
      fatos_confirmados: asStringList(facts.fatos_confirmados, "os fatos confirmados", 1),
      evidencias_usadas: asStringList(facts.evidencias_usadas, "as evidências", 0),
      lacunas: asStringList(facts.lacunas, "as lacunas", 0)
    },
    hipoteses: hypotheses.map((item) => {
      const hypothesis = asRecord(item, "uma hipótese");
      return {
        hipotese: asText(hypothesis.hipotese, "a hipótese", 1, FIRESTORE_LIMITS.shortText),
        confianca: oneOf(hypothesis.confianca, CONFIDENCE, "a confiança da hipótese") as DecisionTraceOutput["hipoteses"][number]["confianca"],
        como_validar: asText(hypothesis.como_validar, "a validação da hipótese", 1, FIRESTORE_LIMITS.shortText)
      };
    }),
    criterios: criteria.map((item) => {
      const criterion = asRecord(item, "um critério");
      return {
        criterio: asText(criterion.criterio, "o critério", 1, FIRESTORE_LIMITS.label),
        peso: oneOf(criterion.peso, WEIGHT, "o peso do critério") as DecisionTraceOutput["criterios"][number]["peso"],
        motivo: asText(criterion.motivo, "o motivo do critério", 1, FIRESTORE_LIMITS.shortText)
      };
    }),
    decisao: {
      recomendacao: asText(decision.recomendacao, "a recomendação", 1, FIRESTORE_LIMITS.longText),
      tipo: asText(decision.tipo, "o tipo da decisão", 1, FIRESTORE_LIMITS.label),
      confianca: oneOf(decision.confianca, CONFIDENCE, "a confiança da decisão") as DecisionTraceOutput["decisao"]["confianca"],
      requer_aprovacao_humana: typeof decision.requer_aprovacao_humana === "boolean"
        ? decision.requer_aprovacao_humana
        : fail("a aprovação humana")
    },
    plano: plan.map((item) => {
      const step = asRecord(item, "um passo do plano");
      return {
        passo: asText(step.passo, "o passo", 1, FIRESTORE_LIMITS.shortText),
        prioridade: oneOf(step.prioridade, WEIGHT, "a prioridade") as DecisionTraceOutput["plano"][number]["prioridade"],
        dono: asText(step.dono, "o dono do passo", 1, FIRESTORE_LIMITS.label),
        prazo_sugerido: asText(step.prazo_sugerido, "o prazo", 1, FIRESTORE_LIMITS.label)
      };
    }),
    trilha_auditavel: {
      regras_aplicadas: asStringList(trail.regras_aplicadas, "as regras aplicadas", 1),
      riscos: asStringList(trail.riscos, "os riscos da trilha", 0),
      versao_decisao: asText(trail.versao_decisao, "a versão da decisão", 1, FIRESTORE_LIMITS.version),
      hash_referencia: asText(trail.hash_referencia, "a referência da trilha", 1, FIRESTORE_LIMITS.hash)
    }
  };
}

export async function ensureUserProfile(user: User): Promise<void> {
  const email = user.email?.trim() ?? "";
  if (email.length < 3 || email.length > FIRESTORE_LIMITS.email) {
    throw new Error("A conta Google precisa ter um e-mail para salvar o perfil.");
  }
  const displayName = (user.displayName ?? "").slice(0, FIRESTORE_LIMITS.displayName);
  const photoURL = user.photoURL && user.photoURL.startsWith("https://") && user.photoURL.length <= FIRESTORE_LIMITS.photoUrl
    ? user.photoURL
    : undefined;

  const db = getFirestoreDb();
  const ref = doc(db, "users", user.uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const payload: Record<string, unknown> = {
      email,
      displayName,
      updatedAt: serverTimestamp()
    };
    if (photoURL) {
      payload.photoURL = photoURL;
    }
    if (!snapshot.exists()) {
      payload.createdAt = serverTimestamp();
    }
    transaction.set(ref, payload, { merge: true });
  });
}

export async function saveDecisionRecord(user: User, decisionId: string, input: DecisionRecordInput): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(decisionId)) {
    throw new Error("Não foi possível salvar a decisão.");
  }
  const request = assertDecisionRequest(input);
  const result = input.result === undefined ? undefined : JSON.stringify(assertDecisionResult(input.result));
  if (result !== undefined && result.length > FIRESTORE_LIMITS.resultJson) {
    throw new Error("Não foi possível salvar a decisão. O resultado passa do limite aceito.");
  }
  const runId = input.runId === undefined ? undefined : asText(input.runId, "a execução", 1, FIRESTORE_LIMITS.runId);
  if (runId !== undefined && !/^[A-Za-z0-9_-]+$/.test(runId)) {
    throw new Error("Não foi possível salvar a execução.");
  }

  await ensureUserProfile(user);
  const db = getFirestoreDb();
  const ref = doc(db, "users", user.uid, "decisions", decisionId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const payload: Record<string, unknown> = {
      projectId: decisionId,
      ...request,
      updatedAt: serverTimestamp()
    };
    if (runId !== undefined) {
      payload.runId = runId;
    }
    if (result !== undefined) {
      payload.result = result;
    }
    if (!snapshot.exists()) {
      payload.createdAt = serverTimestamp();
    }
    transaction.set(ref, payload, { merge: true });
  });
}
