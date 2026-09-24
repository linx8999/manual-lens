import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("electron-builder configuration", () => {
  it("declares a Windows NSIS shortcut and bundles the seed library", async () => {
    const config = await readFile("electron-builder.yml", "utf8");

    expect(config).toContain("appId: com.local.stm32rag");
    expect(config).toContain("createDesktopShortcut: true");
    expect(config).toContain("to: library-manifest.json");
    expect(config).toContain("to: app-icon.ico");
    expect(config).toContain("target: nsis");
  });
});
