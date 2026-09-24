import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../../src/main/storage/database";

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "stm32-rag-db-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("AppDatabase", () => {
  it("stores a document and retrieves it by hash", async () => {
    const root = await createRoot();
    const database = await AppDatabase.open(root);

    database.run(
      `INSERT INTO documents (
        id, sha256, title, original_filename, stored_path, kind,
        page_count, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "d1",
      "abc",
      "Manual",
      "manual.pdf",
      "library/manual.pdf",
      "pdf",
      10,
      "ready",
      "{}",
      1,
      1
    );

    expect(database.findDocumentByHash("abc")).toMatchObject({
      id: "d1",
      title: "Manual"
    });

    database.close();
  });

  it("persists records after reopening the database", async () => {
    const root = await createRoot();
    const first = await AppDatabase.open(root);
    first.run(
      `INSERT INTO conversations (id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      "c1",
      "PA9 配置",
      10,
      11
    );
    first.close();

    const second = await AppDatabase.open(root);
    expect(second.query("SELECT title FROM conversations WHERE id = ?", "c1")).toEqual([
      { title: "PA9 配置" }
    ]);
    second.close();
  });

  it("supports FTS5 token lookup", async () => {
    const root = await createRoot();
    const database = await AppDatabase.open(root);
    database.run(
      `INSERT INTO documents (
        id, sha256, title, original_filename, stored_path, kind,
        page_count, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "d2",
      "hash2",
      "Reference",
      "reference.pdf",
      "library/reference.pdf",
      "pdf",
      20,
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
      "chunk1",
      "d2",
      172,
      0,
      "GPIO 功能描述",
      "PA9 可以用作 USART1_TX。",
      "PA9 USART1_TX GPIO 功能 描述",
      "[]",
      "{}",
      1
    );

    const rows = database.query<{ chunk_id: string }>(
      "SELECT id AS chunk_id FROM chunks_fts WHERE chunks_fts MATCH ?",
      "USART1_TX"
    );
    expect(rows).toEqual([{ chunk_id: "chunk1" }]);
    database.close();
  });
});
