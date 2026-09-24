import { describe, expect, it } from "vitest";
import { reciprocalRankFusion, type SearchHit } from "../../src/main/search/rrf";

function hit(id: string, score = 0): SearchHit {
  return {
    chunkId: id,
    documentId: "d1",
    documentTitle: "Reference",
    pageNumber: 1,
    printedPage: "1",
    heading: null,
    text: id,
    score,
    rank: 0
  };
}

describe("reciprocalRankFusion", () => {
  it("rewards results that rank highly in both lists", () => {
    const result = reciprocalRankFusion([
      [hit("shared"), hit("lexical-only")],
      [hit("shared"), hit("vector-only")]
    ]);

    expect(result.map((item) => item.chunkId)).toEqual([
      "shared",
      "lexical-only",
      "vector-only"
    ]);
  });

  it("supports weighted lists", () => {
    const result = reciprocalRankFusion(
      [
        [hit("other"), hit("base")],
        [hit("aspect")]
      ],
      60,
      [1.2, 0.6]
    );
    expect(result.findIndex((item) => item.chunkId === "base")).toBeLessThan(
      result.findIndex((item) => item.chunkId === "aspect")
    );
  });
});
