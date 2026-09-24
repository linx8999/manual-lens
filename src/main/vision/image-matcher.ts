import type { ImageMatchCandidate, ImageMatchResult } from "../../shared/types";
import { searchTerms } from "../ingestion/search-tokenizer";
import type { AppDatabase } from "../storage/database";
import { ocrImage } from "./ocr-service";

export type OcrFunction = (bytes: Uint8Array) => Promise<string | null>;

interface ChunkRow {
  document_id: string;
  page_number: number;
  document_title: string;
  printed_page: string | null;
  heading: string | null;
  text: string;
  search_tokens: string;
}

/**
 * Matches a screenshot back to the manual page it came from: OCR the image,
 * then rank pages by how many of the recognised terms they contain.
 */
export class ImageMatcher {
  constructor(private readonly database: AppDatabase) {}

  async match(
    bytes: Uint8Array,
    documentIds?: string[],
    ocr: OcrFunction = ocrImage
  ): Promise<ImageMatchResult> {
    const text = await ocr(bytes);
    if (!text) {
      return {
        matched: false,
        confidence: 0,
        ocrText: "",
        candidates: [],
        warnings: [
          "没能从这张图里识别出文字。请确认系统已安装中文 OCR 语言包，或换一张更清晰的截图。"
        ]
      };
    }

    const normalized = normalizeOcrText(text);
    const terms = searchTerms(normalized).slice(0, 400);
    if (terms.length < 4) {
      return {
        matched: false,
        confidence: 0,
        ocrText: text,
        candidates: [],
        warnings: ["识别到的文字太少，无法定位页面。"]
      };
    }

    const scope = documentIds && documentIds.length > 0 ? documentIds : null;
    const candidates = this.rankPages(terms, scope);
    if (candidates.length === 0) {
      return {
        matched: false,
        confidence: 0,
        ocrText: text,
        candidates: [],
        warnings: ["在所选资料里没有找到与截图匹配的页面。"]
      };
    }

    const best = candidates[0];
    const confidence = best?.score ?? 0;
    const warnings: string[] = [];
    if (confidence < 0.3) {
      warnings.push("匹配置信度偏低，建议核对候选页面或把截图拍得更清晰。");
    }
    if (candidates.length > 1 && confidence - (candidates[1]?.score ?? 0) < 0.05) {
      warnings.push("有多个页面得分接近，已按顺序列出，请确认是否为目标页。");
    }

    return {
      matched: confidence >= 0.25,
      confidence,
      ocrText: text,
      candidates,
      warnings
    };
  }

  private rankPages(terms: string[], scope: string[] | null): ImageMatchCandidate[] {
    const scopeClause = scope
      ? `WHERE c.document_id IN (${scope.map(() => "?").join(", ")})`
      : "";
    const total =
      this.database.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM chunks c ${scopeClause}`,
        ...(scope ?? [])
      )[0]?.total ?? 0;
    if (total === 0) {
      return [];
    }

    // Common bigrams such as 模式/寄存器 appear on nearly every page, so weight
    // each recognised term by rarity: the decision then rests on distinctive
    // wording instead of on how much text a page happens to contain.
    const idf = new Map<string, number>();
    const scopeAnd = scope
      ? ` AND c.document_id IN (${scope.map(() => "?").join(", ")})`
      : "";
    // Running headers/footers repeat on most pages, so terms that appear in a
    // large share of the corpus are dropped instead of voted on.
    const maxFrequency = Math.max(4, Math.floor(total * 0.3));
    for (const term of terms.slice(0, 600)) {
      const df =
        this.database.query<{ total: number }>(
          `SELECT COUNT(*) AS total
           FROM chunks_fts
           JOIN chunks c ON c.rowid = chunks_fts.rowid
           WHERE chunks_fts MATCH ?${scopeAnd}`,
          `"${term.replaceAll('"', '""')}"`,
          ...(scope ?? [])
        )[0]?.total ?? 0;
      if (df > 0 && df <= maxFrequency) {
        const value = Math.log(1 + total / (1 + df));
        idf.set(term, value * value);
      }
    }
    if (idf.size === 0) {
      return [];
    }
    const totalIdf = [...idf.values()].reduce((sum, value) => sum + value, 0);

    const chunks = this.database.query<ChunkRow>(
      `SELECT c.document_id,
              c.page_number,
              d.title AS document_title,
              p.printed_page,
              c.heading,
              c.text,
              c.search_tokens
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
       LEFT JOIN pages p
         ON p.document_id = c.document_id AND p.page_number = c.page_number
       ${scopeClause}
       ORDER BY c.document_id, c.page_number, c.chunk_index`,
      ...(scope ?? [])
    );

    // Scoring every page beats pre-filtering with FTS: pages that merely
    // mention many terms can out-rank the real page in a BM25 shortlist.
    const pages = new Map<
      string,
      { terms: Set<string>; best: ChunkRow; bestMatched: number }
    >();
    for (const chunk of chunks) {
      const key = `${chunk.document_id}:${chunk.page_number}`;
      const entry =
        pages.get(key) ?? { terms: new Set<string>(), best: chunk, bestMatched: -1 };
      let matched = 0;
      for (const token of chunk.search_tokens.split(" ")) {
        if (idf.has(token)) {
          entry.terms.add(token);
          matched += 1;
        }
      }
      if (matched > entry.bestMatched) {
        entry.bestMatched = matched;
        entry.best = chunk;
      }
      pages.set(key, entry);
    }

    return [...pages.values()]
      .map((entry) => {
        let matchedIdf = 0;
        for (const term of entry.terms) {
          matchedIdf += idf.get(term) ?? 0;
        }
        return {
          documentId: entry.best.document_id,
          documentTitle: entry.best.document_title,
          pageNumber: entry.best.page_number,
          printedPage: entry.best.printed_page,
          heading: entry.best.heading,
          score: matchedIdf / totalIdf,
          excerpt: excerpt(entry.best.text)
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
  }
}

/**
 * OCR inserts spaces between Chinese glyphs but keeps them between latin
 * words, so join CJK runs while preserving real word boundaries.
 */
export function normalizeOcrText(text: string): string {
  let result = text.normalize("NFKC");
  for (let pass = 0; pass < 4; pass += 1) {
    result = result.replace(/([\u3400-\u9FFF])\s+([\u3400-\u9FFF])/g, "$1$2");
  }
  return result
    .replace(/[，。、；：？！“”‘’（）()《》【】\[\]·|,.;:?!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function excerpt(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 260 ? `${normalized.slice(0, 257)}...` : normalized;
}
