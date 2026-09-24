export interface SearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  printedPage: string | null;
  heading: string | null;
  text: string;
  score: number;
  rank: number;
}

export function reciprocalRankFusion(
  lists: SearchHit[][],
  k = 60,
  weights: number[] = []
): SearchHit[] {
  const fused = new Map<string, SearchHit>();

  lists.forEach((list, listIndex) => {
    list.forEach((item, index) => {
      const rank = index + 1;
      const existing = fused.get(item.chunkId);
      const contribution = (weights[listIndex] ?? 1) / (k + rank);

      if (existing) {
        existing.score += contribution;
        existing.rank = Math.min(existing.rank || rank, rank);
      } else {
        fused.set(item.chunkId, { ...item, rank, score: contribution });
      }
    });
  });

  return [...fused.values()].sort(
    (left, right) => right.score - left.score || left.rank - right.rank
  );
}
