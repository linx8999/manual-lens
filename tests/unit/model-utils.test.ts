import { describe, expect, it } from "vitest";
import {
  chooseEmbeddingModel,
  choosePreferredModel,
  extractSupportedModels
} from "../../src/main/api/model-utils";

describe("model utilities", () => {
  it("extracts supported models from a provider error", () => {
    const message =
      'API 请求失败 (400)：{"error":{"message":"The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed deepseek."}}';
    expect(extractSupportedModels(message)).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
  });

  it("prefers a non-embedding model for chat", () => {
    expect(
      choosePreferredModel(
        ["text-embedding-3-small", "deepseek-flash", "deepseek-v4-pro"],
        "chat"
      )
    ).toBe("deepseek-flash");
  });

  it("prefers an embedding model for vector search", () => {
    expect(chooseEmbeddingModel(["chat-model", "text-embedding-3-large"])).toBe(
      "text-embedding-3-large"
    );
  });
});
