import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../../src/shared/ipc";

describe("IPC channel contract", () => {
  it("keeps channel names unique", () => {
    const names = Object.values(IPC_CHANNELS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("contains the chat request channel", () => {
    expect(Object.values(IPC_CHANNELS)).toContain("chat:ask");
  });
});
