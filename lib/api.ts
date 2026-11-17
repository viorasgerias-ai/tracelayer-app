export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
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
