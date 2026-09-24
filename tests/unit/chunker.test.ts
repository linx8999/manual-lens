import { describe, expect, it } from "vitest";
import { chunkPages } from "../../src/main/ingestion/chunker";

describe("chunkPages", () => {
  it("never joins text from two pages", () => {
    const chunks = chunkPages([
      { pageNumber: 1, printedPage: "1", text: "A".repeat(900) },
      { pageNumber: 2, printedPage: "2", text: "B".repeat(100) }
    ]);

    expect(chunks.some((chunk) => chunk.pageNumber === 1 && chunk.text.includes("B"))).toBe(false);
    expect(chunks.some((chunk) => chunk.pageNumber === 2 && chunk.text.includes("A"))).toBe(false);
  });

  it("adds overlap so context survives a chunk boundary", () => {
    const text = "A".repeat(1000);
    const chunks = chunkPages([{ pageNumber: 1, printedPage: "1", text }]);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.text.slice(-120)).toBe(chunks[1]?.text.slice(0, 120));
  });
});
