const AI_PROVIDER_NOT_CONFIGURED = "AI_PROVIDER_NOT_CONFIGURED";
const AI_PROVIDER_INVALID_RESPONSE = "AI_PROVIDER_INVALID_RESPONSE";

export const DEFAULT_MODEL = process.env.AI_MODEL || "default";

type Message = {
  role: "system" | "user";
  content: string;
};

type JsonSchema = Record<string, unknown>;

type GenerateJsonInput = {
  model: string;
  messages: Message[];
  schemaName: string;
  schema: JsonSchema;
};

export type AiGeneration = {
  id: string | null;
  outputText: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function extractText(payload: unknown): string {
  const record = asRecord(payload);
  const outputText = record?.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText;
  }

  const choices = record?.choices;
  if (Array.isArray(choices)) {
    const firstChoice = asRecord(choices[0]);
    const message = asRecord(firstChoice?.message);
    const content = message?.content;

    if (typeof content === "string" && content.trim()) {
      return content;
    }

    if (Array.isArray(content)) {
      const text = content
        .map((item) => asRecord(item)?.text)
        .filter((item): item is string => typeof item === "string")
        .join("");

      if (text.trim()) {
        return text;
      }
    }
  }

  const content = record?.content;
  if (typeof content === "string" && content.trim()) {
    return content;
  }

  throw new Error(AI_PROVIDER_INVALID_RESPONSE);
}

export function isAIConfigured() {
  return Boolean(process.env.AI_API_URL);
}

export function getAIClient() {
  const endpoint = process.env.AI_API_URL?.trim();
  if (!endpoint) {
    throw new Error(AI_PROVIDER_NOT_CONFIGURED);
  }

  return {
    async generateJson(input: GenerateJsonInput): Promise<AiGeneration> {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (process.env.AI_API_KEY) {
        headers.Authorization = `Bearer ${process.env.AI_API_KEY}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: input.schemaName,
              strict: true,
              schema: input.schema
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`AI_PROVIDER_REQUEST_FAILED_${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error(AI_PROVIDER_INVALID_RESPONSE);
      }

      const record = asRecord(payload);
      const id = typeof record?.id === "string" ? record.id : null;

      return {
        id,
        outputText: extractText(payload)
      };
    }
  };
}

export function isProviderNotConfigured(error: unknown) {
  return error instanceof Error && error.message === AI_PROVIDER_NOT_CONFIGURED;
}
