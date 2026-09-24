import { describe, expect, it } from "vitest";
import { parseCitations } from "../../src/main/chat/citation-parser";
import type { Citation } from "../../src/shared/types";

function source(sourceId: string, pageNumber: number): Citation {
  return {
    sourceId,
    documentId: "d1",
    documentTitle: "Reference",
    chunkId: sourceId,
    pageNumber,
    printedPage: String(pageNumber),
    heading: null,
    excerpt: "evidence",
    score: 1
  };
}

describe("parseCitations", () => {
  it("maps source labels back to exact pages", () => {
    const citations = parseCitations("PA9 uses alternate function mode [S2].", [
      source("S1", 100),
      source("S2", 172)
    ]);

    expect(citations).toEqual([
      expect.objectContaining({ sourceId: "S2", pageNumber: 172 })
    ]);
  });

  it("ignores unknown labels and removes duplicates", () => {
    const citations = parseCitations("A [S1] B [S1] C [S9]", [source("S1", 35)]);
    expect(citations).toHaveLength(1);
    expect(citations[0]?.pageNumber).toBe(35);
  });
});
