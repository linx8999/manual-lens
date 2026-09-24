import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AppPaths } from "../../shared/types";

export function resolveDataPaths(dataRoot: string): AppPaths {
  return {
    dataRoot,
    library: join(dataRoot, "library"),
    index: join(dataRoot, "index"),
    cache: join(dataRoot, "cache"),
    logs: join(dataRoot, "logs"),
    backups: join(dataRoot, "backups")
  };
}

export async function ensureDataPaths(dataRoot: string): Promise<AppPaths> {
  const paths = resolveDataPaths(dataRoot);
  await Promise.all(
    [paths.dataRoot, paths.library, paths.index, paths.cache, paths.logs, paths.backups].map(
      (path) => mkdir(path, { recursive: true })
    )
  );
  return paths;
}
