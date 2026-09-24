import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { ChatService } from "../../src/main/chat/chat-service";
import { ConversationStore } from "../../src/main/chat/conversation-store";
import { AppDatabase } from "../../src/main/storage/database";
import type { ApiSettings, Citation, RetrievalBundle } from "../../src/shared/types";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const citation: Citation = {
  sourceId: "S1",
  documentId: "d1",
  documentTitle: "STM32 参考手册",
  chunkId: "c1",
  pageNumber: 172,
  printedPage: "159",
  heading: "GPIO 功能描述",
  excerpt: "PA9 可以用作 USART1_TX。",
  score: 1
};

const retrieval: { retrieve(question: string): Promise<RetrievalBundle> } = {
  async retrieve(question: string): Promise<RetrievalBundle> {
    return {
      question,
      analysis: {
        original: question,
        normalized: question.toUpperCase(),
        keywords: ["PA9", "USART1_TX"],
        chipModels: [],
        peripherals: ["USART"],
        identifiers: ["PA9", "USART1_TX"],
        aliases: ["UART", "USART"],
        intent: "configure"
      },
      sources: [citation],
      embeddingUsed: false,
      warnings: []
    };
  }
};

const settings: ApiSettings = {
  chatBaseUrl: "http://localhost/v1",
  chatModel: "mock-chat",
  embeddingBaseUrl: "http://localhost/v1",
  embeddingModel: "mock-embedding",
  chatApiKeyConfigured: true,
  embeddingApiKeyConfigured: false,
  requestTimeoutMs: 5000,
  theme: "blue", imageEngine: "local"
};

describe("ChatService", () => {
  it("streams an answer and persists mapped citations", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-chat-"));
    roots.push(root);
    const database = await AppDatabase.open(root);
    const conversations = new ConversationStore(database);
    const chat = new ChatService({
      database,
      conversations,
      retrieval,
      runtimeProvider: async () => ({
        settings,
        chatApiKey: "sk-test",
        embeddingApiKey: null,
        embedQuery: async () => null
      }),
      client: {
        async *chatStream() {
          yield "PA9 可以配置为 USART1_TX";
          yield " [S1]。";
        }
      }
    });
    const events: string[] = [];
    let resolveComplete: (() => void) | undefined;
    const complete = new Promise<void>((resolve) => {
      resolveComplete = resolve;
    });

    const started = await chat.ask({ question: "PA9 怎么配置成 USART1_TX" }, (event) => {
      events.push(event.type);
      if (event.type === "complete") {
        resolveComplete?.();
      }
    });
    await complete;

    const detail = await conversations.get(started.conversationId);
    const assistant = detail.messages.find((message) => message.role === "assistant");

    expect(events).toEqual(expect.arrayContaining(["delta", "sources", "complete"]));
    expect(assistant?.content).toContain("[S1]");
    expect(assistant?.citations).toEqual([
      expect.objectContaining({ sourceId: "S1", pageNumber: 172 })
    ]);
    database.close();
  });

  it("uses a retrieval-only fallback when chat API is not configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-chat-fallback-"));
    roots.push(root);
    const database = await AppDatabase.open(root);
    const conversations = new ConversationStore(database);
    const chat = new ChatService({
      database,
      conversations,
      retrieval,
      runtimeProvider: async () => ({
        settings,
        chatApiKey: null,
        embeddingApiKey: null,
        embedQuery: async () => null
      })
    });
    let answer = "";
    let resolveComplete: (() => void) | undefined;
    const complete = new Promise<void>((resolve) => {
      resolveComplete = resolve;
    });

    const started = await chat.ask({ question: "PA9 怎么配置成 USART1_TX" }, (event) => {
      if (event.type === "delta") {
        answer += event.delta ?? "";
      }
      if (event.type === "complete") {
        resolveComplete?.();
      }
    });
    await complete;
    const detail = await conversations.get(started.conversationId);

    expect(answer).toContain("尚未配置聊天 API");
    expect(answer.match(/尚未配置聊天 API/g)).toHaveLength(1);
    expect(answer.match(/不生成技术结论/g)).toHaveLength(1);
    expect(detail.messages.at(-1)?.citations[0]?.pageNumber).toBe(172);
    database.close();
  });

  it("retries with a provider-advertised model when the configured name is invalid", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-model-retry-"));
    roots.push(root);
    const database = await AppDatabase.open(root);
    const conversations = new ConversationStore(database);
    const updateChatModel = vi.fn(async () => undefined);
    const chat = new ChatService({
      database,
      conversations,
      retrieval,
      runtimeProvider: async () => ({
        settings: { ...settings, chatModel: "deepseek" },
        chatApiKey: "sk-test",
        embeddingApiKey: null,
        embedQuery: async () => null,
        updateChatModel
      }),
      client: {
        async *chatStream(request) {
          if (request.model === "deepseek") {
            throw new Error(
              "API 请求失败 (400)：The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed deepseek."
            );
          }
          yield "PA9 可以配置为 USART1_TX [S1]。";
        }
      }
    });
    const deltas: string[] = [];
    let complete: (() => void) | undefined;
    const done = new Promise<void>((resolve) => {
      complete = resolve;
    });

    await chat.ask({ question: "PA9 怎么配置成 USART1_TX" }, (event) => {
      if (event.type === "delta") deltas.push(event.delta ?? "");
      if (event.type === "complete") complete?.();
    });
    await done;

    expect(updateChatModel).toHaveBeenCalledWith("deepseek-flash");
    expect(deltas.join("")).toContain("USART1_TX");
    database.close();
  }, 10000);
});
