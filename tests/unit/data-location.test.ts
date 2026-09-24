import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  dataRootFromSelection,
  migrateDataRoot,
  readDataRootPointerSync
} from "../../src/main/config/data-location";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

describe("data location", () => {
  it("reads the configured location and falls back when the pointer is absent", async () => {
    const root = await createRoot("stm32-rag-location-");
    const pointer = join(root, "data-location.json");
    const configured = join(root, "custom-data");

    expect(readDataRootPointerSync(pointer, "D:\\fallback")).toBe("D:\\fallback");
    await writeFile(
      pointer,
      JSON.stringify({ version: 1, dataRoot: configured, updatedAt: 1 }),
      "utf8"
    );
    expect(readDataRootPointerSync(pointer, "D:\\fallback")).toBe(configured);
  });

  it("copies the knowledge base and updates the pointer without deleting the old data", async () => {
    const current = await createRoot("stm32-rag-current-");
    const parent = await createRoot("stm32-rag-target-");
    const pointer = join(await createRoot("stm32-rag-pointer-"), "data-location.json");
    await mkdir(join(current, "library"), { recursive: true });
    await mkdir(join(current, "index"), { recursive: true });
    await mkdir(join(current, "app-state"), { recursive: true });
    await writeFile(join(current, "library", "manual.pdf"), "manual", "utf8");
    await writeFile(join(current, "index", "knowledge.db"), "database", "utf8");
    await writeFile(join(current, "settings.json"), "{}", "utf8");
    await writeFile(join(current, "app-state", "cache.bin"), "cache", "utf8");

    const result = await migrateDataRoot({
      currentDataRoot: current,
      parentDirectory: parent,
      pointerPath: pointer
    });
    const target = dataRootFromSelection(parent);

    expect(result.dataRoot).toBe(target);
    await expect(access(join(target, "library", "manual.pdf"))).resolves.toBeUndefined();
    await expect(access(join(target, "index", "knowledge.db"))).resolves.toBeUndefined();
    await expect(access(join(target, "settings.json"))).resolves.toBeUndefined();
    await expect(access(join(target, "app-state"))).rejects.toThrow();
    expect(JSON.parse(await readFile(pointer, "utf8"))).toMatchObject({
      dataRoot: target
    });
    await expect(access(join(current, "library", "manual.pdf"))).resolves.toBeUndefined();
  });

  it("refuses to overwrite a non-empty target directory", async () => {
    const current = await createRoot("stm32-rag-current-");
    const parent = await createRoot("stm32-rag-target-");
    const pointer = join(await createRoot("stm32-rag-pointer-"), "data-location.json");
    const target = dataRootFromSelection(parent);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "existing.txt"), "keep", "utf8");

    await expect(
      migrateDataRoot({
        currentDataRoot: current,
        parentDirectory: parent,
        pointerPath: pointer
      })
    ).rejects.toThrow("目标文件夹不是空目录");
    expect(await readFile(join(target, "existing.txt"), "utf8")).toBe("keep");
  });
});
