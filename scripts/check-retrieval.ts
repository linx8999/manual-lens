import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ImportService } from "../src/main/ingestion/import-service";
import { readLibraryManifest } from "../src/main/ingestion/library-manifest";
import { RetrievalService } from "../src/main/search/retrieval-service";
import { AppDatabase } from "../src/main/storage/database";

const dataRoot = resolve(process.argv[2] ?? join("artifacts", "bench-data"));
await mkdir(dataRoot, { recursive: true });

const database = await AppDatabase.open(dataRoot);
const importer = new ImportService({ dataRoot, database });
const existing = await importer.listDocuments();

if (existing.length === 0) {
  const manifestPath = resolve(
    process.env.STM32_RAG_CORPUS_MANIFEST ?? join("resources", "library-manifest.json")
  );
  const manifest = await readLibraryManifest(manifestPath);
  if (manifest.length === 0) {
    console.error(
      `种子清单 ${manifestPath} 为空。请先把自己的手册放入 resources/library 并填写该清单。`
    );
    database.close();
    process.exit(1);
  }
  console.log("importing", manifest.length, "documents...");
  const results = await importer.importPaths(manifest.map((item) => item.sourcePath));
  console.log(
    "imported:",
    results.filter((result) => result.status === "imported").length,
    "duplicates:",
    results.filter((result) => result.status === "duplicate").length,
    "failed:",
    results.filter((result) => result.status === "failed").length
  );
} else {
  console.log(
    "reusing",
    existing.length,
    "documents,",
    existing.reduce((sum, document) => sum + document.pageCount, 0),
    "pages"
  );
}

const retrieval = new RetrievalService({ database });

const questions = [
  "PA9 怎么配置成 USART1_TX？",
  "串口1的波特率怎么设置",
  "GPIO 推挽输出和开漏输出有什么区别",
  "TIM2 的更新中断怎么开启",
  "ADC 的采样时间怎么配置",
  "STM32F103C8T6 有几个定时器",
  "外部中断怎么配置",
  "独立看门狗的溢出时间怎么算",
  "SPI 主机模式怎么初始化",
  "I2C 的从机地址怎么设置",
  "系统时钟最高可以到多少频率",
  "DMA 怎么配置存储器到外设的传输",
  "复位后 GPIO 引脚默认是什么状态",
  "Flash 编程的步骤是什么",
  "低功耗模式有哪几种"
];

for (const question of questions) {
  const bundle = await retrieval.retrieve(question, 8);
  console.log(`\nQ: ${question}`);
  if (bundle.sources.length === 0) {
    console.log("   (no sources)");
  }
  for (const source of bundle.sources.slice(0, 4)) {
    console.log(
      `   p${source.pageNumber} ${source.documentTitle} | ${source.heading ?? "-"} | ${source.score.toFixed(3)}`
    );
    console.log(`      ${source.excerpt.replace(/\s+/g, " ").slice(0, 140)}`);
  }
}

database.close();
