import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { searchTerms } from "../src/main/ingestion/search-tokenizer";
import { AppDatabase } from "../src/main/storage/database";
import { normalizeOcrText } from "../src/main/vision/image-matcher";
import { ocrImage } from "../src/main/vision/ocr-service";

const shotDir = resolve("artifacts", "image-match");
const file = process.argv[2] ?? "STM32F10xxx参考手册（中文）__p40.png";
const expectedPage = Number(process.argv[3] ?? 40);

const bytes = new Uint8Array(await readFile(join(shotDir, file)));
const text = await ocrImage(bytes);
console.log("OCR length:", text?.length ?? 0);
console.log("OCR head:", (text ?? "").replace(/\s+/g, "").slice(0, 220));

const normalized = normalizeOcrText(text ?? "");
const terms = searchTerms(normalized).slice(0, 400);
console.log("terms:", terms.length, JSON.stringify(terms.slice(0, 20)));

const database = await AppDatabase.open(resolve("artifacts", "bench-data-v2"));
const documents = database.query<{ id: string; title: string }>(
  "SELECT id, title FROM documents"
);
const reference = documents.find((document) => document.title.includes("参考手册"));

const chunks = database.query<{
  document_id: string;
  page_number: number;
  search_tokens: string;
}>("SELECT document_id, page_number, search_tokens FROM chunks");

const termSet = new Set(terms);
const pages = new Map<string, Set<string>>();
for (const chunk of chunks) {
  const key = `${chunk.document_id}:${chunk.page_number}`;
  const set = pages.get(key) ?? new Set<string>();
  for (const token of chunk.search_tokens.split(" ")) {
    if (termSet.has(token)) {
      set.add(token);
    }
  }
  pages.set(key, set);
}

const ranked = [...pages.entries()]
  .map(([key, set]) => ({ key, score: set.size / termSet.size }))
  .sort((left, right) => right.score - left.score);

console.log("\ntop 8 pages by coverage:");
for (const item of ranked.slice(0, 8)) {
  const [documentId, page] = item.key.split(":");
  const title = documents.find((document) => document.id === documentId)?.title ?? "?";
  console.log(`   ${item.score.toFixed(3)} ${title} p${page}`);
}

const truthKey = reference ? `${reference.id}:${expectedPage}` : "";
const truthRank = ranked.findIndex((item) => item.key === truthKey);
console.log(
  `\nexpected ${truthKey} -> rank ${truthRank + 1}, score ${
    truthRank >= 0 ? ranked[truthRank]?.score.toFixed(3) : "n/a"
  }`
);

database.close();
