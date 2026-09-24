import { copyFile, mkdir, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DocumentKind,
  DocumentStatus,
  DocumentSummary,
  ImportProgress,
  ImportResult,
  TocNode
} from "../../shared/types";
import { AppDatabase, type DocumentRow } from "../storage/database";
import { chunkPages, type PageChunk } from "./chunker";
import { hashFile } from "./file-hash";
import { extractImage } from "./image-extractor";
import { headingForPage } from "./outline-heading";
import { extractPdf } from "./pdf-extractor";
import { extractEntityTokens, tokenizeForSearch } from "./search-tokenizer";
import { extractWorkbook } from "./xlsx-extractor";

interface ImportServiceOptions {
  dataRoot: string;
  database: AppDatabase;
}

interface ExtractedPage {
  pageNumber: number;
  printedPage: string | null;
  text: string;
  location: Record<string, unknown>;
}

interface ExtractedDocument {
  title: string;
  kind: DocumentKind;
  pages: ExtractedPage[];
  outline: Array<{ title: string; level: number; pageNumber: number }>;
  metadata: Record<string, unknown>;
}

export class ImportService {
  private readonly dataRoot: string;
  private readonly database: AppDatabase;
  private progressListener: ((progress: ImportProgress) => void) | null = null;

  constructor(options: ImportServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.database = options.database;
  }

  setProgressListener(listener: ((progress: ImportProgress) => void) | null): void {
    this.progressListener = listener;
  }

  async importPaths(paths: string[]): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    for (const path of paths) {
      results.push(await this.importPath(path, results.length, paths.length));
    }
    return results;
  }

  async listDocuments(): Promise<DocumentSummary[]> {
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

  private async importPath(
    path: string,
    completed: number,
    total: number
  ): Promise<ImportResult> {
    const filename = basename(path);
    const jobId = randomUUID();
    let documentId: string | null = null;
    let absoluteStoredPath: string | null = null;

    try {
      this.emit(jobId, filename, "hash", completed, total, "正在计算文件哈希");
      const sha256 = await hashFile(path);
      const existing = this.database.findDocumentByHash(sha256);

      if (existing) {
        this.emit(jobId, filename, "complete", completed + 1, total, "发现相同文件，已跳过");
        return {
          filename,
          status: "duplicate",
          documentId: existing.id,
          duplicateOf: existing.id
        };
      }

      documentId = randomUUID();
      const activeDocumentId = documentId;
      const extension = extname(path).toLowerCase();
      const storedPath = join("library", `${activeDocumentId}${extension}`);
      absoluteStoredPath = join(this.dataRoot, storedPath);
      await mkdir(join(this.dataRoot, "library"), { recursive: true });
      await copyFile(path, absoluteStoredPath);

      const title = titleFromFilename(filename);
      const now = Date.now();
      this.database.run(
        `INSERT INTO documents (
          id, sha256, title, original_filename, stored_path, kind,
          page_count, status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        activeDocumentId,
        sha256,
        title,
        filename,
        storedPath,
        kindFromExtension(extension),
        0,
        "indexing",
        "{}",
        now,
        now
      );
      this.insertJob(
        jobId,
        filename,
        path,
        activeDocumentId,
        "indexing",
        "extract",
        0.1,
        "正在解析"
      );

      this.emit(jobId, filename, "extract", completed, total, "正在提取页、目录和文本");
      const extracted = await extractDocument(path, title);

      this.emit(jobId, filename, "chunk", completed, total, "正在建立页级文本块");
      const chunks = buildChunks(extracted);

      this.database.transaction(() => {
        this.insertPages(activeDocumentId, extracted.pages, now);
        this.insertChunks(activeDocumentId, extracted.title, chunks, now);
        this.insertOutline(activeDocumentId, extracted.outline);
        this.database.run(
          `UPDATE documents
           SET title = ?, page_count = ?, status = 'ready', metadata_json = ?, updated_at = ?
           WHERE id = ?`,
          extracted.title,
          extracted.pages.length,
          JSON.stringify(extracted.metadata),
          Date.now(),
          activeDocumentId
        );
      });

      this.updateJob(
        jobId,
        "ready",
        "complete",
        1,
        `索引完成，共 ${extracted.pages.length} 页，${chunks.length} 个文本块`
      );
      this.emit(
        jobId,
        filename,
        "complete",
        completed + 1,
        total,
        `索引完成，共 ${extracted.pages.length} 页`
      );

      return { filename, status: "imported", documentId: activeDocumentId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (documentId) {
        this.database.run("DELETE FROM documents WHERE id = ?", documentId);
      }
      if (absoluteStoredPath) {
        await rm(absoluteStoredPath, { force: true }).catch(() => undefined);
      }
      this.database.run(
        "UPDATE import_jobs SET document_id = NULL WHERE id = ?",
        jobId
      );
      this.updateJob(jobId, "error", "error", 0, message);
      this.emit(jobId, filename, "error", completed + 1, total, message);
      return { filename, status: "failed", error: message };
    }
  }

  private insertPages(documentId: string, pages: ExtractedPage[], now: number): void {
    for (const page of pages) {
      this.database.run(
        `INSERT INTO pages (
          id, document_id, page_number, printed_page, text, width, height,
          location_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        documentId,
        page.pageNumber,
        page.printedPage,
        page.text,
        typeof page.location.width === "number" ? page.location.width : null,
        typeof page.location.height === "number" ? page.location.height : null,
        JSON.stringify(page.location)
      );
    }
  }

  private insertChunks(
    documentId: string,
    documentTitle: string,
    chunks: PageChunk[],
    now: number
  ): void {
    for (const chunk of chunks) {
      const searchText = [documentTitle, chunk.heading, chunk.text].filter(Boolean).join("\n");
      this.database.run(
        `INSERT INTO chunks (
          id, document_id, page_number, chunk_index, heading, text,
          search_tokens, entities_json, location_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        documentId,
        chunk.pageNumber,
        chunk.chunkIndex,
        chunk.heading,
        chunk.text,
        tokenizeForSearch(searchText),
        JSON.stringify(extractEntityTokens(searchText)),
        JSON.stringify({}),
        now
      );
    }
  }

  private insertOutline(
    documentId: string,
    outline: Array<{ title: string; level: number; pageNumber: number }>
  ): void {
    const lastIdByLevel = new Map<number, string>();
    for (const node of outline) {
      const id = randomUUID();
      const parentId = lastIdByLevel.get(node.level - 1) ?? null;
      this.database.run(
        `INSERT INTO toc_nodes (
          id, document_id, parent_id, title, level, page_number, printed_page
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        documentId,
        parentId,
        node.title,
        node.level,
        node.pageNumber,
        null
      );
      lastIdByLevel.set(node.level, id);
      for (const level of [...lastIdByLevel.keys()]) {
        if (level > node.level) {
          lastIdByLevel.delete(level);
        }
      }
    }
  }

  private insertJob(
    id: string,
    filename: string,
    sourcePath: string,
    documentId: string,
    status: string,
    stage: string,
    progress: number,
    message: string
  ): void {
    this.database.run(
      `INSERT INTO import_jobs (
        id, filename, source_path, document_id, status, stage, progress, message, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      filename,
      sourcePath,
      documentId,
      status,
      stage,
      progress,
      message,
      Date.now()
    );
  }

  private updateJob(
    id: string,
    status: string,
    stage: string,
    progress: number,
    message: string
  ): void {
    this.database.run(
      `UPDATE import_jobs
       SET status = ?, stage = ?, progress = ?, message = ?, updated_at = ?
       WHERE id = ?`,
      status,
      stage,
      progress,
      message,
      Date.now(),
      id
    );
  }

  private emit(
    jobId: string,
    filename: string,
    stage: ImportProgress["stage"],
    completed: number,
    total: number,
    message: string
  ): void {
    this.progressListener?.({ jobId, filename, stage, completed, total, message });
  }
}

async function extractDocument(path: string, fallbackTitle: string): Promise<ExtractedDocument> {
  const extension = extname(path).toLowerCase();

  if (extension === ".pdf") {
    const result = await extractPdf(path);
    return {
      title: fallbackTitle,
      kind: "pdf",
      pages: result.pages.map((page) => ({
        pageNumber: page.pageNumber,
        printedPage: page.printedPage,
        text: page.text,
        location: {
          width: page.width,
          height: page.height,
          positions: page.positions
        }
      })),
      outline: result.outline,
      metadata: result.metadata
    };
  }

  if (extension === ".xlsx" || extension === ".xls") {
    const result = await extractWorkbook(path);
    return {
      title: fallbackTitle,
      kind: "xlsx",
      pages: result.sheets.map((sheet) => ({
        pageNumber: sheet.pageNumber,
        printedPage: String(sheet.pageNumber),
        text: sheet.rows
          .map((row) => row.map((cell) => (cell === null ? "" : String(cell))).join("\t"))
          .join("\n"),
        location: { sheetName: sheet.name, rows: sheet.rows }
      })),
      outline: result.sheets.map((sheet) => ({
        title: sheet.name,
        level: 1,
        pageNumber: sheet.pageNumber
      })),
      metadata: {}
    };
  }

  if (extension === ".png" || extension === ".jpg" || extension === ".jpeg") {
    const result = await extractImage(path);
    return {
      title: fallbackTitle,
      kind: "image",
      pages: [
        {
          pageNumber: 1,
          printedPage: "1",
          text: result.title,
          location: { width: result.width, height: result.height }
        }
      ],
      outline: [{ title: result.title, level: 1, pageNumber: 1 }],
      metadata: { mimeType: result.mimeType }
    };
  }

  throw new Error(`不支持的文件类型：${extension || "未知"}`);
}

function buildChunks(document: ExtractedDocument): PageChunk[] {
  return chunkPages(
    document.pages.map((page) => ({
      pageNumber: page.pageNumber,
      printedPage: page.printedPage,
      text: page.text,
      heading: headingForPage(document.outline, page.pageNumber)
    }))
  );
}

function kindFromExtension(extension: string): DocumentKind {
  if (extension === ".pdf") return "pdf";
  if (extension === ".xlsx" || extension === ".xls") return "xlsx";
  return "image";
}

function titleFromFilename(filename: string): string {
  return filename.slice(0, -extname(filename).length) || filename;
}

export function mapDocumentRow(row: DocumentRow): DocumentSummary {
  const indexedChunkCount = row.chunk_count ?? 0;
  const indexCoverage =
    indexedChunkCount === 0 ? "none" : row.kind === "image" ? "metadata" : "content";

  return {
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    kind: row.kind as DocumentKind,
    pageCount: row.page_count,
    indexedChunkCount,
    indexCoverage,
    status: row.status as DocumentStatus,
    sha256: row.sha256,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
