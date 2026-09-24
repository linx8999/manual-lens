import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../src/shared/ipc";
import { registerIpcHandlers } from "../../src/main/ipc/register-handlers";

describe("registerIpcHandlers", () => {
  it("registers the whitelisted document and chat channels", () => {
    const handlers = new Map<string, unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: unknown) => handlers.set(channel, handler))
    };
    const services = {
      appInfo: () => ({ name: "app", version: "1" }),
      paths: async () => ({}),
      settings: {},
      library: {
        list: async () => []
      },
      importer: {},
      conversations: {},
      chat: {}
    };

    registerIpcHandlers({
      ipcMain: ipcMain as never,
      services: services as never,
      getWindow: () => null
    });

    expect(handlers.has(IPC_CHANNELS.DOCUMENTS_LIST)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.CHAT_ASK)).toBe(true);
  });

  it("pushes the saved theme to the window chrome", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      })
    };
    const services = {
      appInfo: () => ({ name: "app", version: "1" }),
      paths: async () => ({}),
      settings: {
        save: async (input: { theme?: string }) => ({ ...input, theme: input.theme ?? "blue" })
      },
      library: { list: async () => [] },
      importer: {},
      conversations: {},
      chat: {}
    };
    const applyTheme = vi.fn();

    registerIpcHandlers({
      ipcMain: ipcMain as never,
      services: services as never,
      getWindow: () => null,
      applyTheme
    });

    const save = handlers.get(IPC_CHANNELS.SETTINGS_SAVE);
    expect(save).toBeTypeOf("function");
    await save?.({}, { theme: "obsidian" });

    expect(applyTheme).toHaveBeenCalledWith("obsidian");
  });
});
