import { describe, expect, it, vi } from "vitest";
import { createAppStore } from "../../src/renderer/src/state/app-store";
import type { DesktopApi } from "../../src/preload/api";
import type { Citation } from "../../src/shared/types";

const citation: Citation = {
  sourceId: "S1",
  documentId: "doc-1",
  documentTitle: "STM32F10xxx参考手册",
  chunkId: "chunk-1",
  pageNumber: 172,
  printedPage: "159",
  heading: "GPIO 功能描述",
  excerpt: "PA9 可以用作 USART1_TX。",
  score: 1
};

function fakeApi(): DesktopApi {
  return {
    app: {
      getInfo: vi.fn(async () => ({ name: "app", version: "1" })),
      getPaths: vi.fn(async () => ({
        dataRoot: "D:\\data",
        library: "D:\\data\\library",
        index: "D:\\data\\index",
        cache: "D:\\data\\cache",
        logs: "D:\\data\\logs",
        backups: "D:\\data\\backups"
      }))
    },
    knowledge: {
      chooseLocation: vi.fn(async () => null),
      changeLocation: vi.fn()
    },
    settings: {
      get: vi.fn(async () => ({
        chatBaseUrl: "",
        chatModel: "",
        embeddingBaseUrl: "",
        embeddingModel: "",
        chatApiKeyConfigured: false,
        embeddingApiKeyConfigured: false,
        requestTimeoutMs: 60000,
        theme: "blue"
      })),
      save: vi.fn(),
      testChat: vi.fn(),
      testEmbedding: vi.fn(),
      listModels: vi.fn()
    },
    documents: {
      list: vi.fn(async () => []),
      importDialog: vi.fn(async () => []),
      importPaths: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      toc: vi.fn(async () => []),
      asset: vi.fn(async () => ({ kind: "pdf" as const, bytes: new Uint8Array([1]) }))
    },
    importJobs: {
      onProgress: vi.fn(() => () => undefined)
    },
    conversations: {
      list: vi.fn(async () => []),
      get: vi.fn(),
      delete: vi.fn(async () => undefined)
    },
    chat: {
      ask: vi.fn(),
      onEvent: vi.fn(() => () => undefined)
    },
    embeddings: {
      status: vi.fn(),
      rebuild: vi.fn(),
      onProgress: vi.fn(() => () => undefined)
    }
  } as unknown as DesktopApi;
}

describe("app store", () => {
  it("opens the first cited page after an answer completes", async () => {
    const api = fakeApi();
    const store = createAppStore(api);

    store.getState().applyChatEvent({
      conversationId: "conversation-1",
      messageId: "message-1",
      type: "complete",
      citations: [citation]
    });
    await Promise.resolve();

    expect(store.getState().reader).toMatchObject({
      documentId: "doc-1",
      pageNumber: 172,
      excerpt: citation.excerpt
    });
    expect(api.documents.asset).toHaveBeenCalledWith("doc-1");
  });
});
