import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ImportService } from "../../src/main/ingestion/import-service";
import { RetrievalService } from "../../src/main/search/retrieval-service";
import { AppDatabase } from "../../src/main/storage/database";
import { samplePdf } from "../helpers/corpus";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.skipIf(!samplePdf)("RetrievalService", () => {
  it("returns page-anchored results from an imported manual", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-retrieval-"));
    roots.push(root);
    const database = await AppDatabase.open(root);
    const importer = new ImportService({ dataRoot: root, database });
    await importer.importPaths([samplePdf as string]);
    const retrieval = new RetrievalService({ database });

    const result = await retrieval.retrieve("STM32F10xxx 闪存编程");

    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0]?.pageNumber).toBeGreaterThan(0);
    expect(result.sources[0]?.excerpt).toContain("闪存");
    database.close();
  }, 30000);
});
