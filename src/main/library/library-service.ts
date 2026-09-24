import { readFile, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { DocumentAsset, DocumentSummary, TocNode } from "../../shared/types";
import { AppDatabase, type DocumentRow } from "../storage/database";
import { mapDocumentRow } from "../ingestion/import-service";
import { extractWorkbook } from "../ingestion/xlsx-extractor";

interface LibraryServiceOptions {
  dataRoot: string;
  database: AppDatabase;
}

interface TocRow {
  id: string;
  document_id: string;
  parent_id: string | null;
  title: string;
  level: number;
  page_number: number;
  printed_page: string | null;
}

export class LibraryService {
  private readonly dataRoot: string;
  private readonly database: AppDatabase;

  constructor(options: LibraryServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.database = options.database;
  }

  async list(): Promise<DocumentSummary[]> {
    return this.database
      .query<DocumentRow>(
        `SELECT d.*,
                (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count
         FROM documents d
         ORDER BY CASE d.kind WHEN 'pdf' THEN 0 WHEN 'xlsx' THEN 1 ELSE 2 END,
                  d.created_at ASC`
      )
      .map(mapDocumentRow);
  }

  async remove(documentId: string): Promise<void> {
    const row = this.getDocument(documentId);
    this.database.run("DELETE FROM documents WHERE id = ?", documentId);
    await rm(this.resolveStoredPath(row.stored_path), { force: true });
  }

  async getToc(documentId: string): Promise<TocNode[]> {
    return this.database
      .query<TocRow>(
        `SELECT * FROM toc_nodes
         WHERE document_id = ?
         ORDER BY page_number, level, rowid`,
        documentId
      )
      .map((row) => ({
        id: row.id,
        documentId: row.document_id,
        parentId: row.parent_id,
        title: row.title,
        level: row.level,
        pageNumber: row.page_number,
        printedPage: row.printed_page
      }));
  }

  async getAsset(documentId: string): Promise<DocumentAsset> {
    const row = this.getDocument(documentId);
    const absolutePath = this.resolveStoredPath(row.stored_path);

    if (row.kind === "xlsx") {
      const workbook = await extractWorkbook(absolutePath);
      return { kind: "xlsx", sheets: workbook.sheets };
    }

    const bytes = new Uint8Array(await readFile(absolutePath));
    return {
      kind: row.kind === "pdf" ? "pdf" : "image",
      bytes,
      mimeType: row.kind === "pdf" ? "application/pdf" : undefined
    };
  }

  private getDocument(documentId: string): DocumentRow {
    const row = this.database.query<DocumentRow>(
      "SELECT * FROM documents WHERE id = ?",
      documentId
    )[0];
    if (!row) {
      throw new Error("未找到指定资料。");
    }
    return row;
  }

  private resolveStoredPath(storedPath: string): string {
    const root = resolve(this.dataRoot);
    const absolute = resolve(root, storedPath);
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
      throw new Error("资料路径超出知识库目录。");
    }
    return absolute;
  }
}
