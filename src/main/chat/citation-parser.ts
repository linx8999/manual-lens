import type { Citation } from "../../shared/types";

export function parseCitations(answer: string, sources: Citation[]): Citation[] {
  const sourceMap = new Map(sources.map((source) => [source.sourceId, source]));
  const used = new Set<string>();
  const citations: Citation[] = [];

  for (const match of answer.matchAll(/\[S(\d+)\]/g)) {
    const sourceId = `S${match[1]}`;
    if (used.has(sourceId)) {
      continue;
    }
    const source = sourceMap.get(sourceId);
    if (source) {
      used.add(sourceId);
      citations.push(source);
    }
  }

  return citations;
}
