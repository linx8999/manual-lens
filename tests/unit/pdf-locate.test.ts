import { describe, expect, it } from "vitest";
import {
  pageFromScrollTop,
  pageScrollTop,
  resolvePageNumber
} from "../../src/renderer/src/lib/pdf";

describe("resolvePageNumber", () => {
  it("clamps requested pages to the PDF page range", () => {
    expect(resolvePageNumber(0, 10)).toBe(1);
    expect(resolvePageNumber(11, 10)).toBe(10);
    expect(resolvePageNumber(4, 10)).toBe(4);
  });
});

describe("continuous page scrolling", () => {
  it("maps pages to vertical offsets", () => {
    expect(pageScrollTop(1, 800, 16)).toBe(0);
    expect(pageScrollTop(5, 800, 16)).toBe(3264);
  });

  it("maps scroll position back to the visible page", () => {
    expect(pageFromScrollTop(0, 800, 16, 10)).toBe(1);
    expect(pageFromScrollTop(2450, 800, 16, 10)).toBe(4);
    expect(pageFromScrollTop(999999, 800, 16, 10)).toBe(10);
  });
});
