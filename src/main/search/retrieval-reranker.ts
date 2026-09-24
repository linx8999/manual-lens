import type { QueryAnalysis } from "../../shared/types";
import type { RetrievalPlan } from "./query-planner";
import type { SearchHit } from "./rrf";

export function rerankHits(
  hits: SearchHit[],
  analysis: QueryAnalysis,
  plan?: RetrievalPlan
): SearchHit[] {
  const nonNavigationHits = hits.filter((hit) => !isNavigationHit(hit));
  const usableHits = nonNavigationHits.length >= 3 ? nonNavigationHits : hits;
  const specificIdentifiers = analysis.identifiers.filter(
    (identifier) => !analysis.chipModels.includes(identifier)
  );
  const exactHits =
    specificIdentifiers.length > 0
      ? usableHits.filter((hit) => matchesAnyIdentifier(hit, specificIdentifiers))
      : usableHits;
  const pool = exactHits.length > 0 ? exactHits : usableHits;

  const scored = pool
    .map((hit) => ({
      hit: {
        ...hit,
        score:
          hit.score +
          scoreHit(hit, analysis, specificIdentifiers) +
          1 / (20 + hit.rank)
      }
    }))
    .sort(
      (left, right) =>
        right.hit.score - left.hit.score ||
        left.hit.rank - right.hit.rank
    );

  return selectDiverseHits(
    scored.map(({ hit }) => hit),
    plan?.aspects ?? []
  );
}

export function selectDiverseHits(
  hits: SearchHit[],
  aspects: RetrievalPlan["aspects"]
): SearchHit[] {
  const seenPages = new Set<string>();
  const selected: SearchHit[] = [];
  const documentCounts = new Map<string, number>();
  const resultLimit = aspects.some((aspect) => aspect.id === "timer-inventory") ? 4 : 8;
  const topScore = hits[0]?.score ?? 0;
  const minimumScore = topScore > 1.6 ? topScore * 0.38 : 0;

  const add = (hit: SearchHit | undefined, ignoreDocumentCap = false): boolean => {
    if (!hit) {
      return false;
    }
    const pageKey = `${hit.documentId}:${hit.pageNumber}`;
    const documentCount = documentCounts.get(hit.documentId) ?? 0;
    if (
      seenPages.has(pageKey) ||
      (!ignoreDocumentCap && documentCount >= 6)
    ) {
      return false;
    }
    seenPages.add(pageKey);
    documentCounts.set(hit.documentId, documentCount + 1);
    selected.push(hit);
    return true;
  };

  for (const aspect of aspects) {
    const requiredMatches = 1;
    const best = hits
      .filter((hit) => {
        const pageKey = `${hit.documentId}:${hit.pageNumber}`;
        if (seenPages.has(pageKey)) {
          return false;
        }
        const haystack = `${hit.heading ?? ""}\n${hit.text}`.toUpperCase();
        const matches = aspect.keywords.filter((keyword) =>
          haystack.includes(keyword.toUpperCase())
        ).length;
        return matches >= requiredMatches;
      })
      .map((hit) => {
        const heading = (hit.heading ?? "").toUpperCase();
        const headingMatch = aspect.keywords.some((keyword) =>
          heading.includes(keyword.toUpperCase())
        );
        return { hit, headingMatch };
      })
      .sort(
        (left, right) =>
          Number(right.headingMatch) - Number(left.headingMatch) ||
          right.hit.score - left.hit.score
      )[0]?.hit;
    // Never force a weak aspect hit into the answer just to cover an aspect.
    if (best && best.score < topScore * 0.15) {
      continue;
    }
    add(best, true);
  }

  for (const hit of hits) {
    if (selected.length >= resultLimit) {
      break;
    }
    if (hit.score < minimumScore) {
      continue;
    }
    add(hit);
  }

  return selected.sort((left, right) => right.score - left.score);
}

function matchesAnyIdentifier(hit: SearchHit, identifiers: string[]): boolean {
  const haystack = `${hit.documentTitle}\n${hit.heading ?? ""}\n${hit.text}`.toUpperCase();
  return identifiers.some((identifier) => haystack.includes(identifier));
}

function scoreHit(
  hit: SearchHit,
  analysis: QueryAnalysis,
  specificIdentifiers: string[]
): number {
  const title = hit.documentTitle.toUpperCase();
  const heading = (hit.heading ?? "").toUpperCase();
  const text = hit.text.toUpperCase();
  let score = 0;

  for (const identifier of specificIdentifiers) {
    if (heading.includes(identifier)) {
      score += 0.65;
    } else if (text.includes(identifier)) {
      score += 0.45;
    }
  }

  // Section headings are curated topic names, so a keyword landing in the
  // heading is a strong signal for questions like "存储器映射".
  for (const keyword of analysis.keywords) {
    const upper = keyword.toUpperCase();
    if (upper.length < 2) {
      continue;
    }
    if (heading.includes(upper)) {
      score += 0.45;
    } else if (upper.length >= 4 && text.includes(upper)) {
      score += 0.12;
    }
  }

  const matchedIdentifiers = specificIdentifiers.filter((identifier) =>
    text.includes(identifier)
  ).length;
  if (matchedIdentifiers >= 2) {
    score += 0.55;
  }

  for (const peripheral of analysis.peripherals) {
    if (text.includes(peripheral) || heading.includes(peripheral)) {
      score += 0.08;
    }
  }
  for (const chip of analysis.chipModels) {
    if (text.includes(chip) || title.includes(chip)) {
      score += 0.04;
    }
  }

  const isReference = /参考手册|REFERENCE MANUAL/.test(title);
  const isDatasheet = /数据手册|DATASHEET/.test(title);
  const isPinMaterial = /引脚定义|PINOUT/.test(title);
  const isFirmware = /固件函数库|FIRMWARE/.test(title);
  if (
    isReference &&
    (analysis.intent === "configure" ||
      analysis.intent === "register" ||
      analysis.peripherals.length > 0)
  ) {
    score += 0.28;
  }
  if (
    isPinMaterial &&
    (analysis.intent === "pin" ||
      specificIdentifiers.some((identifier) => /^P[A-G]\d/.test(identifier)))
  ) {
    score += 0.2;
  }
  if (
    isFirmware &&
    /函数|代码|库|API|初始化|配置/.test(analysis.original)
  ) {
    score += 0.12;
  }
  if (
    isDatasheet &&
    /几个|多少|数量|计数|个数/.test(analysis.original) &&
    /定时器|ADC|USART|SPI|I2C|通信接口/.test(analysis.original)
  ) {
    const inventoryMatches = [
      "7个定时器",
      "1个高级控制定时器",
      "3个通用16位定时器",
      "3个普通定时器",
      "定时器功能比较"
    ].filter((phrase) => `${heading}\n${text}`.includes(phrase)).length;
    score += Math.min(0.9, inventoryMatches * 0.35);
  }

  const compactText = text.replace(/\s+/g, "");
  const compactQuestion = analysis.normalized.replace(/\s+/g, "");
  if (compactText.includes(compactQuestion) && compactQuestion.length >= 4) {
    score += 0.35;
  }
  if (/相关文档|目录|参考文献/.test(heading)) {
    score -= 0.45;
  }
  if (isTableOfContents(text)) {
    score -= 0.8;
  }

  return score;
}

function isNavigationHit(hit: SearchHit): boolean {
  return /相关文档|目录|参考文献/.test(hit.heading ?? "") || isTableOfContents(hit.text);
}

/** Table-of-contents pages use dot leaders between the title and page number. */
function isTableOfContents(text: string): boolean {
  return (text.match(/\.{4,}/g) ?? []).length >= 3;
}
