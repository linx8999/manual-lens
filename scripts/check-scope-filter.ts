import { resolve } from "node:path";
import { RetrievalService } from "../src/main/search/retrieval-service";
import { AppDatabase } from "../src/main/storage/database";

const database = await AppDatabase.open(
  resolve(process.argv[2] ?? "artifacts/bench-data-v2")
);
const retrieval = new RetrievalService({ database });
const documents = database.query<{ id: string; title: string }>(
  "SELECT id, title FROM documents"
);
const target = documents.find((document) => document.title.includes("闪存编程参考手册"));
if (!target) {
  throw new Error("基准库中找不到闪存编程参考手册");
}

const unrestricted = await retrieval.retrieve("USART 波特率怎么配置", 8);
console.log(
  `未勾选时命中资料：${[...new Set(unrestricted.sources.map((s) => s.documentTitle))].join(" / ")}`
);

const scoped = await retrieval.retrieve("USART 波特率怎么配置", 8, [target.id]);
const titles = [...new Set(scoped.sources.map((source) => source.documentTitle))];
console.log(`勾选 1 份资料后命中资料：${titles.join(" / ") || "(无)"}`);
console.log(`结果条数：${scoped.sources.length}`);

const leaked = scoped.sources.filter((source) => source.documentId !== target.id);
console.log(
  leaked.length === 0
    ? "PASS 检索结果全部来自勾选的资料"
    : `FAIL 有 ${leaked.length} 条结果越界`
);

const empty = await retrieval.retrieve("USART 波特率怎么配置", 8, ["not-a-document"]);
console.log(`勾选不存在的资料时结果条数：${empty.sources.length}`);

database.close();
