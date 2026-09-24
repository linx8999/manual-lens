import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ImportService } from "../../src/main/ingestion/import-service";
import { RetrievalService } from "../../src/main/search/retrieval-service";
import { AppDatabase } from "../../src/main/storage/database";
import { availableManifest } from "../helpers/corpus";

const roots: string[] = [];
const corpus = availableManifest();

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// These expectations describe the full reference corpus, so they only run when
// the complete manual set is present locally.
describe.skipIf(corpus.length < 8)("supplied STM32 corpus", () => {
  it("imports unique files and retrieves a page-anchored PA9 source", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-corpus-"));
    roots.push(root);
    const database = await AppDatabase.open(root);
    const importer = new ImportService({ dataRoot: root, database });
    try {
      const results = await importer.importPaths(corpus.map((item) => item.sourcePath));
      const documents = await importer.listDocuments();
      const retrieval = new RetrievalService({ database });
      const search = await retrieval.retrieve("PA9 怎么配置成 USART1_TX");

      expect(results.filter((result) => result.status === "imported")).toHaveLength(8);
      expect(results.filter((result) => result.status === "duplicate")).toHaveLength(1);
      expect(documents).toHaveLength(8);
      expect(documents.reduce((sum, document) => sum + document.pageCount, 0)).toBe(1687);
      expect(
        documents.filter((document) => document.title.includes("STM32F103x8B"))
      ).toHaveLength(1);
      expect(search.sources.some((source) => source.documentTitle.includes("参考手册"))).toBe(
        true
      );
      expect(search.sources[0]?.pageNumber).toBeGreaterThan(0);
      expect(search.sources).toHaveLength(8);
      expect(
        search.sources.some(
          (source) =>
            source.pageNumber === 120 &&
            source.excerpt.toUpperCase().includes("USART1_REMAP")
        )
      ).toBe(true);
      expect(
        search.sources.some(
          (source) =>
            source.pageNumber === 113 &&
            source.heading?.toUpperCase().includes("GPIOX_CRL")
        )
      ).toBe(true);
      expect(
        search.sources.some((source) =>
          /RCC_APB2ENR|APB2|时钟使能/.test(source.heading ?? "")
        )
      ).toBe(true);
      expect(
        search.sources.some(
          (source) =>
            source.heading?.includes("USART_CR1") ||
            source.excerpt.toUpperCase().includes("USART_CR1")
        )
      ).toBe(true);

      const timerSearch = await retrieval.retrieve("STM32F103C8T6 有几个定时器");
      expect(timerSearch.sources).toHaveLength(4);
      expect(
        timerSearch.sources.some(
          (source) =>
            source.documentTitle.includes("STM32F103x8B") &&
            source.pageNumber === 9
        )
      ).toBe(true);

      // Regression: 疑问词（有哪几种）曾因 ID 权重把 PWR 低功耗模式的页面挤掉。
      const lowPowerSearch = await retrieval.retrieve("低功耗模式有哪几种");
      expect(
        lowPowerSearch.sources.some(
          (source) =>
            source.documentTitle.includes("参考手册") &&
            source.pageNumber >= 38 &&
            source.pageNumber <= 45
        )
      ).toBe(true);
    } finally {
      database.close();
    }
  }, 240000);
});
