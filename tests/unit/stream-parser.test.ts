import { describe, expect, it } from "vitest";
import { StreamParser } from "../../src/main/api/stream-parser";

describe("StreamParser", () => {
  it("extracts text deltas across chunk boundaries", () => {
    const parser = new StreamParser();
    const first = parser.push('data: {"choices":[{"delta":{"content":"US');
    const second = parser.push('ART1"}}]}\n\ndata: [DONE]\n\n');

    expect([...first, ...second].join("")).toBe("USART1");
  });
});
