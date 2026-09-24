import { resolve } from "node:path";
import { AppDatabase } from "../src/main/storage/database";
import { ImportService } from "../src/main/ingestion/import-service";
import { readLibraryManifest } from "../src/main/ingestion/library-manifest";

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const dataRoot = argumentValue("data-root") || process.env.STM32_RAG_DATA_ROOT;
  if (!dataRoot) {
    throw new Error(
      "请通过 --data-root=<目录> 或环境变量 STM32_RAG_DATA_ROOT 指定资料库目录。"
    );
  }
  const manifestPath = resolve(
    argumentValue("manifest") || resolve("resources", "library-manifest.json")
  );
  const manifest = await readLibraryManifest(manifestPath);
  if (manifest.length === 0) {
    console.log(
      `种子清单 ${manifestPath} 为空，无需导入。可把自己的手册放入 resources/library 并填写该清单。`
    );
    return;
  }
  const database = await AppDatabase.open(dataRoot);
  const importer = new ImportService({ dataRoot, database });

  importer.setProgressListener((progress) => {
    console.log(
      `[${progress.completed}/${progress.total}] ${progress.filename} - ${progress.message}`
    );
  });

  try {
    const results = await importer.importPaths(manifest.map((item) => item.sourcePath));
    const imported = results.filter((result) => result.status === "imported").length;
    const duplicates = results.filter((result) => result.status === "duplicate").length;
    const failed = results.filter((result) => result.status === "failed");
    console.log(`导入完成：${imported} 份新资料，${duplicates} 份重复，${failed.length} 份失败。`);
    for (const failure of failed) {
      console.error(`${failure.filename}: ${failure.error}`);
    }
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    database.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
