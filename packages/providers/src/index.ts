export type ProviderType = "ollama" | "openai-compatible";

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  baseUrl: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface ProviderHealthStatus {
  ok: boolean;
  providerId: string;
  providerType: ProviderType;
  baseUrl: string;
  model?: string;
  latencyMs: number;
  message: string;
}

export interface ProviderGenerateResult {
  ok: boolean;
  providerId: string;
  providerType: ProviderType;
  model?: string;
  latencyMs: number;
  text: string;
  message: string;
}

export interface ModelProvider {
  id: string;
  type: ProviderType;
  config: ProviderConfig;
  healthCheck(): Promise<ProviderHealthStatus>;
  generate(prompt: string): Promise<ProviderGenerateResult>;
}

export function createProvider(config: ProviderConfig): ModelProvider {
  const normalized: ProviderConfig = {
    ...config,
    baseUrl: config.baseUrl.replace(/\/+$/, ""),
    timeoutMs: config.timeoutMs ?? 10_000,
  };

  return {
    id: normalized.id,
    type: normalized.type,
    config: normalized,
    async healthCheck() {
      const startedAt = Date.now();
      const path = normalized.type === "ollama" ? "/api/tags" : "/models";
      const headers: Record<string, string> = {};
      if (normalized.type === "openai-compatible" && normalized.apiKey) {
        headers.authorization = `Bearer ${normalized.apiKey}`;
      }

      try {
        const body = await requestJson(
          `${normalized.baseUrl}${path}`,
          normalized.timeoutMs ?? 10_000,
          headers,
        );
        const models =
          normalized.type === "ollama"
            ? readOllamaModels(body)
            : readOpenAICompatibleModels(body);

        if (
          normalized.model &&
          models.length > 0 &&
          !models.includes(normalized.model)
        ) {
          return buildStatus(
            false,
            normalized,
            Date.now() - startedAt,
            `Provider reachable, but model "${normalized.model}" is unavailable`,
          );
        }

        return buildStatus(
          true,
          normalized,
          Date.now() - startedAt,
          "Provider reachable",
        );
      } catch (error) {
        return buildStatus(
          false,
          normalized,
          Date.now() - startedAt,
          error instanceof Error ? error.message : "Unknown provider error",
        );
      }
    },
    async generate(prompt: string) {
      const startedAt = Date.now();

      if (!normalized.model) {
        return {
          ok: false,
          providerId: normalized.id,
          providerType: normalized.type,
          model: normalized.model,
          latencyMs: Date.now() - startedAt,
          text: "",
          message: "Model is required for generation",
        };
      }

      try {
        const text =
          normalized.type === "ollama"
            ? await generateWithOllama(normalized, prompt)
            : await generateWithOpenAICompatible(normalized, prompt);

        return {
          ok: true,
          providerId: normalized.id,
          providerType: normalized.type,
          model: normalized.model,
          latencyMs: Date.now() - startedAt,
          text,
          message: "Generation completed",
        };
      } catch (error) {
        return {
          ok: false,
          providerId: normalized.id,
          providerType: normalized.type,
          model: normalized.model,
          latencyMs: Date.now() - startedAt,
          text: "",
          message: error instanceof Error ? error.message : "Unknown generation error",
        };
      }
    },
  };
}

export function formatHealthCheck(status: ProviderHealthStatus): string {
  const lines = [
    `[${status.ok ? "PASS" : "FAIL"}] ${status.providerType} (${status.providerId})`,
    `baseUrl: ${status.baseUrl}`,
    `latency: ${status.latencyMs}ms`,
    `message: ${status.message}`,
  ];

  if (status.model) {
    lines.splice(2, 0, `model: ${status.model}`);
  }

  return lines.join("\n");
}

async function requestJson(
  url: string,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<unknown> {
  return request(url, timeoutMs, { method: "GET", headers });
}

async function request(
  url: string,
  timeoutMs: number,
  init: RequestInit,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildStatus(
  ok: boolean,
  config: ProviderConfig,
  latencyMs: number,
  message: string,
): ProviderHealthStatus {
  return {
    ok,
    providerId: config.id,
    providerType: config.type,
    baseUrl: config.baseUrl,
    model: config.model,
    latencyMs,
    message,
  };
}

async function generateWithOllama(
  config: ProviderConfig,
  prompt: string,
): Promise<string> {
  const body = await request(
    `${config.baseUrl}/api/generate`,
    config.timeoutMs ?? 10_000,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        stream: false,
      }),
    },
  );

  if (isRecord(body) && typeof body.response === "string") {
    return body.response;
  }

  throw new Error("Invalid Ollama generation response");
}

async function generateWithOpenAICompatible(
  config: ProviderConfig,
  prompt: string,
): Promise<string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }

  const body = await request(
    `${config.baseUrl}/chat/completions`,
    config.timeoutMs ?? 10_000,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    },
  );

  const text = readOpenAICompatibleText(body);
  if (text) {
    return text;
  }

  throw new Error("Invalid OpenAI-compatible generation response");
}

function readOllamaModels(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.models)) {
    return [];
  }

  return body.models
    .map((entry) =>
      isRecord(entry) && typeof entry.name === "string" ? entry.name : undefined,
    )
    .filter((value): value is string => Boolean(value));
}

function readOpenAICompatibleModels(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    return [];
  }

  return body.data
    .map((entry) =>
      isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined,
    )
    .filter((value): value is string => Boolean(value));
}

function readOpenAICompatibleText(body: unknown): string | undefined {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return undefined;
  }

  for (const choice of body.choices) {
    if (!isRecord(choice)) {
      continue;
    }

    if (typeof choice.text === "string") {
      return choice.text;
    }

    if (
      isRecord(choice.message) &&
      typeof choice.message.content === "string"
    ) {
      return choice.message.content;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
