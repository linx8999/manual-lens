import { resolve } from "node:path";
import { ensureSearchIndex } from "../src/main/search/search-index";
import { RetrievalService } from "../src/main/search/retrieval-service";
import { AppDatabase } from "../src/main/storage/database";

const dataRoot = resolve(process.argv[2] ?? "artifacts/bench-data");
const database = await AppDatabase.open(dataRoot);

const chunks = database.query<{ total: number }>("SELECT COUNT(*) AS total FROM chunks")[0]?.total ?? 0;
const before = database.query<{ heading: string | null; search_tokens: string }>(
  "SELECT heading, search_tokens FROM chunks LIMIT 1"
)[0];
console.log("chunks:", chunks);
console.log("before:", JSON.stringify(before?.search_tokens.slice(0, 80)));

const started = Date.now();
ensureSearchIndex(database);
console.log("migration ms:", Date.now() - started);

const after = database.query<{ heading: string | null; search_tokens: string }>(
  "SELECT heading, search_tokens FROM chunks LIMIT 1"
)[0];
console.log("after:", JSON.stringify(after?.search_tokens.slice(0, 80)));

const retrieval = new RetrievalService({ database });
for (const question of ["低功耗模式有哪几种", "PA9 怎么配置成 USART1_TX？"]) {
  const bundle = await retrieval.retrieve(question, 8);
  console.log(`\nQ: ${question}`);
  for (const source of bundle.sources.slice(0, 4)) {
    console.log(`   p${source.pageNumber} ${source.documentTitle} | ${source.heading ?? "-"}`);
  }
}

database.close();
