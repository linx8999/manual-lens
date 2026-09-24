import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmbeddingIndexService } from "../../src/main/embeddings/embedding-index-service";
import { RetrievalService } from "../../src/main/search/retrieval-service";
import { AppDatabase } from "../../src/main/storage/database";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createDatabase(): Promise<AppDatabase> {
  const root = await mkdtemp(join(tmpdir(), "stm32-rag-embedding-"));
  roots.push(root);
  const database = await AppDatabase.open(root);
  database.run(
    `INSERT INTO documents (
      id, sha256, title, original_filename, stored_path, kind,
      page_count, status, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "doc-1",
    "hash-1",
    "Reference",
    "reference.pdf",
    "library/reference.pdf",
    "pdf",
    1,
    "ready",
    "{}",
    1,
    1
  );
  database.run(
    `INSERT INTO chunks (
      id, document_id, page_number, chunk_index, heading, text,
      search_tokens, entities_json, location_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "chunk-1",
    "doc-1",
    1,
    0,
    "GPIO",
    "PA9 is USART1_TX.",
    "PA9 USART1_TX GPIO",
    "[]",
    "{}",
    1
  );
  return database;
}

describe("EmbeddingIndexService", () => {
  it("builds embeddings and records progress", async () => {
    const database = await createDatabase();
    const embed = vi.fn(async ({ input }: { input: string[] }) => ({
      model: "embedding-test",
      vectors: input.map(() => Float32Array.from([1, 2, 3]))
    }));
    const service = new EmbeddingIndexService({
      database,
      runtimeProvider: async () => ({
        baseUrl: "http://localhost/v1",
        apiKey: "sk-test",
        model: "embedding-test",
        timeoutMs: 5000
      }),
      client: { embed }
    });
    const progress: number[] = [];

    const status = await service.rebuild((event) => progress.push(event.completed));

    expect(embed).toHaveBeenCalledOnce();
    expect(progress.at(-1)).toBe(1);
    expect(status).toMatchObject({
      model: "embedding-test",
      indexed: 1,
      total: 1,
      complete: true
    });
    expect(
      database.query<{ count: number }>("SELECT COUNT(*) AS count FROM embeddings")[0]?.count
    ).toBe(1);
    const retrieval = new RetrievalService({
      database,
      embedQuery: async () => ({
        vector: Float32Array.from([1, 2, 3]),
        model: "embedding-test"
      })
    });
    const result = await retrieval.retrieve("PA9");
    expect(result.embeddingUsed).toBe(true);
    expect(result.sources[0]?.pageNumber).toBe(1);
    database.close();
  });

  it("keeps the previous index when rebuilding another model fails", async () => {
    const database = await createDatabase();
    const success = {
      embed: vi.fn(async ({ input }: { input: string[] }) => ({
        model: "model-a",
        vectors: input.map(() => Float32Array.from([1, 0]))
      }))
    };
    const first = new EmbeddingIndexService({
      database,
      runtimeProvider: async () => ({
        baseUrl: "http://localhost/v1",
        apiKey: "sk-test",
        model: "model-a",
        timeoutMs: 5000
      }),
      client: success
    });
    await first.rebuild(() => undefined);

    const failing = new EmbeddingIndexService({
      database,
      runtimeProvider: async () => ({
        baseUrl: "http://localhost/v1",
        apiKey: "sk-test",
        model: "model-b",
        timeoutMs: 5000
      }),
      client: {
        embed: vi.fn(async () => {
          throw new Error("provider unavailable");
        })
      }
    });

    await expect(failing.rebuild(() => undefined)).rejects.toThrow("provider unavailable");
    expect(
      database.query<{ model: string }>("SELECT model FROM embeddings")[0]?.model
    ).toBe("model-a");
    database.close();
  });
});
