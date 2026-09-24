import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractPdf } from "../src/main/ingestion/pdf-extractor";

const libraryDir = process.env.STM32_RAG_CORPUS_DIR ?? "resources/library";
if (!existsSync(libraryDir)) {
  console.error(
    `未找到语料目录 ${libraryDir}。请把自己的 PDF 放进去，或用 STM32_RAG_CORPUS_DIR 指定目录。`
  );
  process.exit(1);
}

const files = (await readdir(libraryDir))
  .filter((file) => file.toLowerCase().endsWith(".pdf"))
  .sort();

const report = [];

for (const file of files) {
  const pdf = await extractPdf(join(libraryDir, file));
  const stat = pdf.pages.map((page) => page.text.replace(/\s/g, "").length);
  const emptyPages = stat.filter((length) => length < 20).length;
  const totalChars = stat.reduce((sum, length) => sum + length, 0);
  report.push({
    file,
    pages: pdf.pageCount,
    emptyPages,
    coverage: Number((((pdf.pageCount - emptyPages) / pdf.pageCount) * 100).toFixed(2)),
    avgCharsPerPage: Math.round(totalChars / pdf.pageCount),
    outlineNodes: pdf.outline.length
  });
  console.log(JSON.stringify(report.at(-1)));
}

await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/extraction-report.json", JSON.stringify(report, null, 2), "utf8");
