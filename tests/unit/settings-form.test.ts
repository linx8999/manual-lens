import { describe, expect, it } from "vitest";
import { syncSettingsForm } from "../../src/renderer/src/lib/settings-form";
import type { ApiSettings } from "../../src/shared/types";

const settings: ApiSettings = {
  chatBaseUrl: "https://api.deepseek.com",
  chatModel: "deepseek-flash",
  embeddingBaseUrl: "https://api.deepseek.com",
  embeddingModel: "",
  chatApiKeyConfigured: true,
  embeddingApiKeyConfigured: true,
  requestTimeoutMs: 60000,
  theme: "blue", imageEngine: "local"
};

describe("syncSettingsForm", () => {
  it("keeps typed API keys after a test or settings refresh", () => {
    const current = {
      chatBaseUrl: "https://api.deepseek.com",
      chatModel: "deepseek-flash",
      embeddingBaseUrl: "https://api.deepseek.com",
      embeddingModel: "",
      chatApiKey: "sk-chat-typed",
      embeddingApiKey: "sk-embedding-typed",
      requestTimeoutMs: 60000,
      theme: "blue" as const,
      imageEngine: "local" as const
    };

    expect(syncSettingsForm(current, settings)).toMatchObject({
      chatApiKey: "sk-chat-typed",
      embeddingApiKey: "sk-embedding-typed",
      chatModel: "deepseek-flash"
    });
  });
});
