import type { AppDatabase } from "../storage/database";

interface TocRow {
  document_id: string;
  title: string;
  level: number;
  page_number: number;
}

export interface SectionMatch {
  documentId: string;
  from: number;
  to: number;
}

/**
 * Maps question keywords onto the manual table of contents so the exact
 * section start page can be promoted above merely similar pages.
 */
export class SectionIndex {
  constructor(private readonly database: AppDatabase) {}

  match(keywords: string[], documentIds?: string[]): SectionMatch[] {
    const terms = keywords
      .map((keyword) => keyword.normalize("NFKC").toUpperCase())
      .filter((keyword) => keyword.length >= 2);
    if (terms.length === 0) {
      return [];
    }

    const scope = documentIds && documentIds.length > 0 ? documentIds : null;
    const rows = this.database.query<TocRow>(
      `SELECT document_id, title, level, page_number
       FROM toc_nodes
       ${scope ? `WHERE document_id IN (${scope.map(() => "?").join(", ")})` : ""}
       ORDER BY document_id, page_number, level`,
      ...(scope ?? [])
    );

    const byDocument = new Map<string, TocRow[]>();
    for (const row of rows) {
      const list = byDocument.get(row.document_id) ?? [];
      list.push(row);
      byDocument.set(row.document_id, list);
    }

    const matches: SectionMatch[] = [];
    for (const [documentId, nodes] of byDocument) {
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (!node) {
          continue;
        }
        const title = node.title.normalize("NFKC").toUpperCase();
        if (!terms.some((term) => title.includes(term))) {
          continue;
        }
        let end = Number.MAX_SAFE_INTEGER;
        for (let next = index + 1; next < nodes.length; next += 1) {
          const candidate = nodes[next];
          if (!candidate) {
            continue;
          }
          if (candidate.page_number > node.page_number && candidate.level <= node.level) {
            end = candidate.page_number - 1;
            break;
          }
        }
        matches.push({ documentId, from: node.page_number, to: end });
      }
    }

    return matches;
  }
}

export function sectionBoost(
  matches: SectionMatch[],
  documentId: string,
  pageNumber: number
): number {
  let boost = 0;
  for (const match of matches) {
    if (match.documentId !== documentId) {
      continue;
    }
    if (pageNumber === match.from) {
      boost = Math.max(boost, 0.55);
    } else if (pageNumber > match.from && pageNumber <= match.to) {
      boost = Math.max(boost, 0.18);
    }
  }
  return boost;
}
