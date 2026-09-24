import { readFileSync } from "node:fs";
import { access, cp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export const DATA_DIRECTORY_NAME = "STM32RAG知识库";

interface DataLocationPointer {
  version: 1;
  dataRoot: string;
  updatedAt: number;
}

interface MigrateDataRootOptions {
  currentDataRoot: string;
  parentDirectory: string;
  pointerPath: string;
}

export function dataRootFromSelection(parentDirectory: string): string {
  if (!isAbsolute(parentDirectory)) {
    throw new Error("请选择绝对路径文件夹。");
  }
  return join(resolve(parentDirectory), DATA_DIRECTORY_NAME);
}

export function readDataRootPointerSync(pointerPath: string, fallback: string): string {
  try {
    const raw = readFileSync(pointerPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DataLocationPointer>;
    return typeof parsed.dataRoot === "string" && isAbsolute(parsed.dataRoot)
      ? resolve(parsed.dataRoot)
      : fallback;
  } catch {
    return fallback;
  }
}

export async function migrateDataRoot(
  options: MigrateDataRootOptions
): Promise<{ dataRoot: string }> {
  const currentDataRoot = resolve(options.currentDataRoot);
  const targetDataRoot = dataRootFromSelection(options.parentDirectory);
  validateMove(currentDataRoot, targetDataRoot);
  await access(currentDataRoot);
  await prepareTarget(targetDataRoot);

  try {
    await cp(currentDataRoot, targetDataRoot, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (source) => basename(source) !== "app-state"
    });
    await writeDataRootPointer(options.pointerPath, targetDataRoot);
    return { dataRoot: targetDataRoot };
  } catch (error) {
    await rm(targetDataRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function prepareTarget(targetDataRoot: string): Promise<void> {
  try {
    const entries = await readdir(targetDataRoot);
    if (entries.length > 0) {
      throw new Error("目标文件夹不是空目录，请选择其他位置。");
    }
    await rm(targetDataRoot, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

function validateMove(currentDataRoot: string, targetDataRoot: string): void {
  if (currentDataRoot === targetDataRoot) {
    throw new Error("目标位置与当前知识库位置相同。");
  }
  if (isInside(currentDataRoot, targetDataRoot) || isInside(targetDataRoot, currentDataRoot)) {
    throw new Error("新位置不能放在当前知识库目录内部，也不能包含当前知识库目录。");
  }
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

async function writeDataRootPointer(pointerPath: string, dataRoot: string): Promise<void> {
  await mkdir(dirname(pointerPath), { recursive: true });
  const temporaryPath = `${pointerPath}.tmp`;
  const payload: DataLocationPointer = {
    version: 1,
    dataRoot,
    updatedAt: Date.now()
  };
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporaryPath, pointerPath);
}
