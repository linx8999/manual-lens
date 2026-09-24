import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecretStore } from "../../src/main/security/secret-store";
import { SettingsStore } from "../../src/main/storage/settings-store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local settings", () => {
  it("saves non-secret settings without writing API keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-settings-"));
    roots.push(root);
    const store = new SettingsStore(root);

    await store.save({
      chatBaseUrl: "https://api.example.com/v1",
      chatModel: "chat-model",
      embeddingBaseUrl: "https://api.example.com/v1",
      embeddingModel: "embedding-model",
      requestTimeoutMs: 60000,
      theme: "white"
    });

    const raw = await readFile(join(root, "settings.json"), "utf8");
    expect(raw).toContain("chat-model");
    expect(raw).toContain("white");
    expect(raw).not.toContain("sk-secret");
  });

  it("maps legacy theme names onto the current three themes", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-theme-"));
    roots.push(root);
    const store = new SettingsStore(root);

    await writeFile(
      join(root, "settings.json"),
      JSON.stringify({ theme: "graphite" }),
      "utf8"
    );
    expect((await store.load()).theme).toBe("white");

    await writeFile(
      join(root, "settings.json"),
      JSON.stringify({ theme: "rose" }),
      "utf8"
    );
    expect((await store.load()).theme).toBe("blue");
  });

  it("encrypts and restores API keys through the cipher adapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "stm32-rag-secret-"));
    roots.push(root);
    const cipher = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
      decryptString: (value: Buffer) => value.toString().replace("encrypted:", "")
    };
    const store = new SecretStore(root, cipher);

    await store.setApiKey("chat", "sk-secret");
    expect(await store.getApiKey("chat")).toBe("sk-secret");
    expect(await store.hasApiKey("chat")).toBe(true);
    expect(await store.getApiKey("embedding")).toBeNull();
  });
});
