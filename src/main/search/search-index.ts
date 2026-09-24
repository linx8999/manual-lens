import {
  SEARCH_TOKENIZER_VERSION,
  tokenizeForSearch
} from "../ingestion/search-tokenizer";
import { headingForPage, type OutlineHeadingNode } from "../ingestion/outline-heading";
import type { AppDatabase } from "../storage/database";

const VERSION_KEY = "search_index_version";

interface ChunkRow {
  rowid: number;
  document_id: string;
  page_number: number;
  text: string;
  document_title: string;
}

interface OutlineRow {
  document_id: string;
  title: string;
  level: number;
  page_number: number;
}

/**
 * Rebuilds derived search data (page headings and CJK search tokens) for
 * libraries that were indexed by an older tokenizer. Re-reading the manuals is
 * unnecessary because every page already stores its extracted text.
 */
export function ensureSearchIndex(database: AppDatabase): void {
  const current = database.query<{ value: string }>(
    "SELECT value FROM schema_meta WHERE key = ?",
    VERSION_KEY
  )[0]?.value;
  if (current === SEARCH_TOKENIZER_VERSION) {
    return;
  }

  const outlines = new Map<string, OutlineHeadingNode[]>();
  for (const row of database.query<OutlineRow>(
    "SELECT document_id, title, level, page_number FROM toc_nodes"
  )) {
    const nodes = outlines.get(row.document_id) ?? [];
    nodes.push({ title: row.title, level: row.level, pageNumber: row.page_number });
    outlines.set(row.document_id, nodes);
  }

  const chunks = database.query<ChunkRow>(
    `SELECT c.rowid AS rowid,
            c.document_id,
            c.page_number,
            c.text,
            d.title AS document_title
     FROM chunks c
     JOIN documents d ON d.id = c.document_id`
  );

  database.transaction(() => {
    for (const chunk of chunks) {
      const heading = headingForPage(outlines.get(chunk.document_id) ?? [], chunk.page_number);
      const searchText = [chunk.document_title, heading, chunk.text]
        .filter(Boolean)
        .join("\n");
      database.run(
        "UPDATE chunks SET heading = ?, search_tokens = ? WHERE rowid = ?",
        heading,
        tokenizeForSearch(searchText),
        chunk.rowid
      );
    }
    database.run(
      "INSERT OR REPLACE INTO schema_meta(key, value) VALUES (?, ?)",
      VERSION_KEY,
      SEARCH_TOKENIZER_VERSION
    );
  });
}
