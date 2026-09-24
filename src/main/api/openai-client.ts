import { redactSecrets } from "./key-redaction";
import { StreamParser } from "./stream-parser";

export type ChatMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: ChatMessageContent;
}

export interface ChatStreamRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessageInput[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface EmbeddingRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  input: string[];
  timeoutMs?: number;
}

export interface EmbeddingResult {
  model: string;
  vectors: Float32Array[];
}

export interface ModelListOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

interface EmbeddingResponse {
  model?: string;
  data?: Array<{ index?: number; embedding?: number[] }>;
  error?: { message?: string };
}

interface ModelsResponse {
  data?: Array<{ id?: string }>;
  error?: { message?: string };
}

export class OpenAIClient {
  async *chatStream(request: ChatStreamRequest): AsyncGenerator<string> {
    const response = await requestWithRetry(
      endpoint(request.baseUrl, "chat/completions"),
      {
        method: "POST",
        headers: requestHeaders(request.apiKey),
        body: JSON.stringify({
          model: request.model,
          messages: request.messages.map(toChatCompletionMessage),
          stream: true,
          temperature: request.temperature ?? 0.15,
          max_tokens: request.maxTokens
        })
      },
      request.timeoutMs ?? 60000,
      [request.apiKey]
    );

    if (!response.body) {
      throw new Error("聊天接口没有返回可读取的流。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new StreamParser();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        for (const delta of parser.flush()) {
          yield delta;
        }
        break;
      }
      for (const delta of parser.push(decoder.decode(value, { stream: true }))) {
        yield delta;
      }
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const response = await requestWithRetry(
      endpoint(request.baseUrl, "embeddings"),
      {
        method: "POST",
        headers: requestHeaders(request.apiKey),
        body: JSON.stringify({
          model: request.model,
          input: request.input
        })
      },
      request.timeoutMs ?? 60000,
      [request.apiKey]
    );
    const payload = (await response.json()) as EmbeddingResponse;
    if (!payload.data?.length) {
      throw new Error(payload.error?.message || "向量接口没有返回 embedding 数据。");
    }

    const ordered = [...payload.data].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
    return {
      model: payload.model || request.model,
      vectors: ordered.map((item) => Float32Array.from(item.embedding ?? []))
    };
  }

  async listModels(options: ModelListOptions): Promise<string[]> {
    const response = await requestWithRetry(
      endpoint(options.baseUrl, "models"),
      {
        method: "GET",
        headers: requestHeaders(options.apiKey)
      },
      options.timeoutMs ?? 30000,
      [options.apiKey]
    );
    const payload = (await response.json()) as ModelsResponse;
    if (!payload.data) {
      throw new Error(payload.error?.message || "模型接口没有返回 data 列表。");
    }
    return [
      ...new Set(
        payload.data
          .map((item) => item.id?.trim())
          .filter((id): id is string => Boolean(id))
      )
    ].sort((left, right) => left.localeCompare(right));
  }
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  secrets: string[]
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.ok) {
        return response;
      }

      const body = await response.text();
      const message = redactSecrets(
        `API 请求失败 (${response.status})：${body || response.statusText}`,
        secrets
      );
      if (response.status !== 429 && response.status < 500) {
        throw new Error(message);
      }
      lastError = new Error(message);
    } catch (error) {
      lastError = error;
    }

    if (attempt < 2) {
      await delay(350 * 2 ** attempt);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(redactSecrets(message, secrets));
}

function endpoint(baseUrl: string, path: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized.endsWith(`/${path}`)) {
    return normalized;
  }
  return `${normalized}/${path}`;
}

function requestHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`
  };
}

function toChatCompletionMessage(message: ChatMessageInput): ChatMessageInput {
  return {
    role: message.role,
    content: message.content
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
