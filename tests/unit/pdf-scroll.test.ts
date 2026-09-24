import { describe, expect, it } from "vitest";
import { rescaleScrollTop } from "../../src/renderer/src/lib/pdf";

describe("rescaleScrollTop", () => {
  it("keeps the same relative position when the reader grows", () => {
    expect(rescaleScrollTop(1000, 800, 1200)).toBe(1500);
  });

  it("keeps the same relative position when the reader shrinks", () => {
    expect(rescaleScrollTop(1500, 1200, 800)).toBe(1000);
  });

  it("leaves the offset alone for degenerate slot heights", () => {
    expect(rescaleScrollTop(500, 0, 800)).toBe(500);
    expect(rescaleScrollTop(500, 800, 0)).toBe(500);
  });
});
