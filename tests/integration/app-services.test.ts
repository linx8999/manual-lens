import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import XLSX from "xlsx";
import type { OpenAIClient } from "../../src/main/api/openai-client";
import { AppServices } from "../../src/main/services/app-services";
import type { ApiSettingsInput } from "../../src/shared/types";

const roots: string[] = [];
const cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  decryptString: (value: Buffer) => value.toString().replace("encrypted:", "")
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("AppServices", () => {
  it("creates the knowledge layout and stores secrets outside settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-services-"));
    roots.push(root);
    const services = await AppServices.create({ dataRoot: root, secretCipher: cipher });

    const saved = await services.settings.save({
      chatBaseUrl: "https://api.example.com/v1",
      chatModel: "chat-model",
      embeddingBaseUrl: "https://api.example.com/v1",
      embeddingModel: "embedding-model",
      chatApiKey: "sk-chat",
      embeddingApiKey: "sk-embedding"
    });

    expect(saved.chatApiKeyConfigured).toBe(true);
    expect(saved.embeddingApiKeyConfigured).toBe(true);
    expect((await services.paths()).library).toBe(join(root, "library"));
    expect(await services.secrets.getApiKey("chat")).toBe("sk-chat");
    services.close();
  });

  it("automatically indexes newly imported chunks when embeddings are configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-services-"));
    roots.push(root);
    const embed = vi.fn(async ({ input }: { input: string[] }) => ({
      model: "embedding-test",
      vectors: input.map(() => Float32Array.from([1, 0, 0]))
    }));
    const services = await AppServices.create({
      dataRoot: root,
      secretCipher: cipher,
      client: {
        embed,
        listModels: vi.fn(async () => []),
        chatStream: async function* () {
          yield "";
        }
      } as unknown as OpenAIClient
    });
    await services.settings.save(embeddingSettings());
    const workbookPath = join(root, "新引脚表.xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["引脚", "功能"],
        ["PA9", "USART1_TX"]
      ]),
      "PB9"
    );
    XLSX.writeFile(workbook, workbookPath);

    const results = await services.importPaths([workbookPath]);
    const status = await services.getEmbeddingStatus();
    const chunks = services.database.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM chunks"
    )[0]?.count;

    expect(results[0]?.status).toBe("imported");
    expect(embed).toHaveBeenCalled();
    expect(status).toMatchObject({
      configured: true,
      indexed: chunks,
      total: chunks,
      complete: true
    });
    services.close();
  }, 30000);

  it("keeps imported text searchable when automatic embedding fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-services-"));
    roots.push(root);
    const services = await AppServices.create({
      dataRoot: root,
      secretCipher: cipher,
      client: {
        embed: vi.fn(async () => {
          throw new Error("embedding unavailable");
        }),
        listModels: vi.fn(async () => []),
        chatStream: async function* () {
          yield "";
        }
      } as unknown as OpenAIClient
    });
    await services.settings.save(embeddingSettings());
    const workbookPath = join(root, "fallback.xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["寄存器", "说明"], ["GPIOA_CRL", "端口配置低寄存器"]]),
      "寄存器"
    );
    XLSX.writeFile(workbook, workbookPath);

    const results = await services.importPaths([workbookPath]);
    const documents = await services.listDocuments();
    const ftsCount = services.database.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM chunks_fts"
    )[0]?.count;

    expect(results[0]?.status).toBe("imported");
    expect(results[0]?.warning).toContain("关键词");
    expect(documents[0]?.status).toBe("ready");
    expect(ftsCount).toBeGreaterThan(0);
    services.close();
  }, 30000);
});

function embeddingSettings(): ApiSettingsInput {
  return {
    chatBaseUrl: "https://api.example.com/v1",
    chatModel: "deepseek-flash",
    embeddingBaseUrl: "https://api.example.com/v1",
    embeddingModel: "embedding-test",
    chatApiKey: "sk-chat",
    embeddingApiKey: "sk-embedding"
  };
}
