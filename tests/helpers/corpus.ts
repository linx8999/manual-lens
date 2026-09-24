import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { ImportManifestItem } from "../../src/shared/types";

/**
 * The repository does not ship STM32 manuals (they are copyrighted material).
 * Tests that need a real corpus look for one locally and skip otherwise.
 */
const libraryDir = resolve(process.env.STM32_RAG_CORPUS_DIR ?? "resources/library");

export function corpusFile(...segments: string[]): string | null {
  const path = resolve(libraryDir, ...segments);
  return existsSync(path) ? path : null;
}

export const samplePdf = corpusFile("STM32F10xxx闪存编程参考手册（中文）.pdf");
export const sampleXlsx = corpusFile("STM32F103C8T6引脚定义.xlsx");

const manifestCandidates = [
  resolve("resources", "library-manifest.local.json"),
  resolve("resources", "library-manifest.json")
];

/** Manifest entries whose files actually exist on this machine. */
export function availableManifest(): ImportManifestItem[] {
  const manifestFile = manifestCandidates.find((candidate) => existsSync(candidate));
  if (!manifestFile) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(manifestFile, "utf8")) as ImportManifestItem[];
    const manifestDirectory = dirname(manifestFile);
    return parsed.flatMap((item) => {
      if (!item?.sourcePath) {
        return [];
      }
      const sourcePath = isAbsolute(item.sourcePath)
        ? item.sourcePath
        : resolve(manifestDirectory, item.sourcePath);
      return existsSync(sourcePath) ? [{ ...item, sourcePath }] : [];
    });
  } catch {
    return [];
  }
}
