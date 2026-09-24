import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { ImportManifestItem } from "../../shared/types";

export async function readLibraryManifest(
  manifestPath: string
): Promise<ImportManifestItem[]> {
  // A local override keeps private corpora out of the public repository while
  // still letting the author's machine seed and test against real manuals.
  const localPath = manifestPath.replace(/\.json$/i, ".local.json");
  const resolvedPath = existsSync(localPath) ? localPath : manifestPath;
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw) as ImportManifestItem[];
  const manifestDirectory = dirname(resolvedPath);

  return parsed.map((item, index) => {
    if (
      !item ||
      typeof item.title !== "string" ||
      typeof item.sourcePath !== "string" ||
      !["pdf", "xlsx", "image"].includes(item.kind)
    ) {
      throw new Error(`种子资料清单第 ${index + 1} 项格式无效。`);
    }
    return {
      ...item,
      sourcePath: isAbsolute(item.sourcePath)
        ? item.sourcePath
        : resolve(manifestDirectory, item.sourcePath)
    };
  });
}
