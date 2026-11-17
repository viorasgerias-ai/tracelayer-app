import { getFirebaseAuth } from "@/lib/firebase";

async function firebaseAuthHeader(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return {};
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch {
    return {};
  }
}

export function explainApiError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message === "Não autenticado.") {
    return "A API não aceitou o token. Confira FIREBASE_PROJECT_ID e as credenciais padrão do ambiente.";
  }
  return error instanceof Error ? error.message : fallback;
}

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const bearer = await firebaseAuthHeader();
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
      ...bearer
    }
  });

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : null;
    const message = record?.detail ?? record?.error;
    throw new Error(typeof message === "string" ? message : "A solicitação falhou.");
  }
  return data as T;
}
