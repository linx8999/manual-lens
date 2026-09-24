import type { QueryAnalysis } from "../../shared/types";
import { searchTerms, stripQueryStopwords } from "../ingestion/search-tokenizer";
import type { AppDatabase } from "../storage/database";
import type { SearchHit } from "./rrf";

interface LexicalRow {
  chunk_id: string;
  document_id: string;
  document_title: string;
  page_number: number;
  printed_page: string | null;
  heading: string | null;
  text: string;
  search_tokens: string;
  rank: number;
}

export class LexicalSearch {
  constructor(private readonly database: AppDatabase) {}

  search(analysis: QueryAnalysis, limit = 60, documentIds?: string[]): SearchHit[] {
    const queryText = [
      analysis.normalized,
      ...analysis.identifiers,
      ...analysis.peripherals,
      ...analysis.aliases
    ].join(" ");
    const cleanedQuery = stripQueryStopwords(queryText);
    const terms = searchTerms(cleanedQuery);
    if (terms.length === 0) {
      return [];
    }

    const scope = documentIds && documentIds.length > 0 ? documentIds : null;
    const selectedTerms = this.selectDiscriminativeTerms(terms, scope);
    if (selectedTerms.length === 0) {
      return [];
    }

    const match = selectedTerms
      .map((term) => `"${term.replaceAll('"', '""')}"`)
      .join(" OR ");
    const scopeClause = scope
      ? ` AND c.document_id IN (${scope.map(() => "?").join(", ")})`
      : "";
    const rows = this.database.query<LexicalRow>(
      `SELECT
         c.id AS chunk_id,
         c.document_id,
         d.title AS document_title,
         c.page_number,
         p.printed_page,
         c.heading,
         c.text,
         c.search_tokens,
         bm25(chunks_fts, 0.0, 1.0) AS rank
       FROM chunks_fts
       JOIN chunks c ON c.rowid = chunks_fts.rowid
       JOIN documents d ON d.id = c.document_id
       LEFT JOIN pages p
         ON p.document_id = c.document_id AND p.page_number = c.page_number
       WHERE chunks_fts MATCH ?${scopeClause}
       ORDER BY rank ASC
       LIMIT ?`,
      match,
      ...(scope ?? []),
      Math.max(limit * 4, 120)
    );

    const compactKeywords = analysis.keywords
      .map((keyword) => keyword.replace(/\s+/g, "").toUpperCase())
      .filter((keyword) => keyword.length >= 2);
    const scored = rows.map((row) => {
      const tokens = new Set(row.search_tokens.split(" "));
      const matched = selectedTerms.reduce(
        (sum, term) => sum + (tokens.has(term) ? 1 : 0),
        0
      );
      const compactText = row.text.replace(/\s+/g, "").toUpperCase();
      const phraseHits = compactKeywords.filter((keyword) =>
        compactText.includes(keyword)
      ).length;
      const sectionHits = compactKeywords.filter((keyword) =>
        new RegExp(`\\d+(?:\\.\\d+)*\\s*${escapeRegExp(keyword)}`).test(row.text)
      ).length;
      return {
        row,
        bm25: Math.max(-row.rank, 0),
        coverage: selectedTerms.length > 0 ? matched / selectedTerms.length : 0,
        phrase: compactKeywords.length > 0 ? phraseHits / compactKeywords.length : 0,
        // "4.3 低功耗模式" style section titles are the strongest manual signal.
        sectionTitle:
          compactKeywords.length > 0 ? sectionHits / compactKeywords.length : 0
      };
    });
    const maxBm25 = Math.max(...scored.map((entry) => entry.bm25), Number.EPSILON);

    return scored
      .map((entry) => ({
        chunkId: entry.row.chunk_id,
        documentId: entry.row.document_id,
        documentTitle: entry.row.document_title,
        pageNumber: entry.row.page_number,
        printedPage: entry.row.printed_page,
        heading: entry.row.heading,
        text: entry.row.text,
        // BM25 alone is unbounded and query dependent, so blend it with
        // term coverage and an exact-phrase signal into a 0..1 relevance.
        score:
          0.35 * (entry.bm25 / maxBm25) +
          0.25 * entry.coverage +
          0.2 * entry.phrase +
          0.2 * entry.sectionTitle,
        rank: 0
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((hit, index) => ({ ...hit, rank: index + 1 }));
  }

  /**
   * Terms that appear in a large share of the corpus carry almost no signal
   * (for Chinese, 模式/输出 and friends match everywhere) and they flatten the
   * BM25 ranking, so they are dropped from the query when rarer terms exist.
   */
  private selectDiscriminativeTerms(terms: string[], scope: string[] | null): string[] {
    const total = this.totalChunks(scope);
    if (total === 0) {
      return [];
    }

    const scored = terms.map((term) => ({
      term,
      frequency: this.documentFrequency(term, scope)
    }));
    const usable = scored.filter((entry) => entry.frequency > 0);
    const maxFrequency = Math.max(3, Math.floor(total * 0.2));
    const discriminative = usable.filter((entry) => entry.frequency <= maxFrequency);
    const pool = discriminative.length > 0 ? discriminative : usable;

    return pool
      .sort((left, right) => left.frequency - right.frequency)
      .slice(0, 48)
      .map((entry) => entry.term);
  }

  private totalChunks(scope: string[] | null): number {
    const scopeClause = scope
      ? ` WHERE document_id IN (${scope.map(() => "?").join(", ")})`
      : "";
    return (
      this.database.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM chunks${scopeClause}`,
        ...(scope ?? [])
      )[0]?.total ?? 0
    );
  }

  private documentFrequency(term: string, scope: string[] | null): number {
    const scopeClause = scope
      ? ` AND c.document_id IN (${scope.map(() => "?").join(", ")})`
      : "";
    return (
      this.database.query<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM chunks_fts
         JOIN chunks c ON c.rowid = chunks_fts.rowid
         WHERE chunks_fts MATCH ?${scopeClause}`,
        `"${term.replaceAll('"', '""')}"`,
        ...(scope ?? [])
      )[0]?.total ?? 0
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
