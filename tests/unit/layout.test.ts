import { describe, expect, it } from "vitest";
import { clampReaderWidth, readerDragScale } from "../../src/renderer/src/lib/layout";

describe("clampReaderWidth", () => {
  it("keeps the reader wide enough for its outline and page", () => {
    expect(clampReaderWidth(200, 1600)).toBe(440);
  });

  it("does not let the reader squeeze the chat below its minimum width", () => {
    expect(clampReaderWidth(1000, 1100)).toBe(328);
  });

  it("allows a freely widened reader on a large window", () => {
    expect(clampReaderWidth(760, 1800)).toBe(760);
  });
});

describe("readerDragScale", () => {
  it("scales the frozen page raster to the live container width", () => {
    expect(readerDragScale(560, 700)).toBeCloseTo(668 / 528, 5);
  });

  it("keeps the raster untouched when the width did not change", () => {
    expect(readerDragScale(560, 560)).toBe(1);
  });

  it("clamps to the minimum page width so narrow drags stay stable", () => {
    expect(readerDragScale(360, 120)).toBeCloseTo(320 / 328, 5);
  });

  it("falls back to no scaling for unusable input", () => {
    expect(readerDragScale(0, 0)).toBe(1);
    expect(readerDragScale(Number.NaN, 600)).toBe(1);
  });
});
