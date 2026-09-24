import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATABASE_SCHEMA } from "./schema";

export interface DocumentRow {
  id: string;
  sha256: string;
  title: string;
  original_filename: string;
  stored_path: string;
  kind: string;
  page_count: number;
  status: string;
  error_message: string | null;
  metadata_json: string;
  created_at: number;
  updated_at: number;
  chunk_count?: number;
}

type SqlValue = string | number | bigint | null | Uint8Array;

export class AppDatabase {
  readonly path: string;
  private readonly database: DatabaseSync;

  private constructor(path: string) {
    this.path = path;
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.database.exec(DATABASE_SCHEMA);
  }

  static async open(dataRoot: string): Promise<AppDatabase> {
    const path = join(dataRoot, "index", "knowledge.db");
    mkdirSync(dirname(path), { recursive: true });
    return new AppDatabase(path);
  }

  query<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): T[] {
    const statement = this.database.prepare(sql);
    return statement.all(...params) as T[];
  }

  run(sql: string, ...params: SqlValue[]): void {
    const statement = this.database.prepare(sql);
    statement.run(...params);
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  transaction<T>(work: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  findDocumentByHash(sha256: string): DocumentRow | null {
    const rows = this.query<DocumentRow>(
      "SELECT * FROM documents WHERE sha256 = ? LIMIT 1",
      sha256
    );
    return rows[0] ?? null;
  }

  save(): void {
    this.database.exec("PRAGMA wal_checkpoint(PASSIVE);");
  }

  close(): void {
    this.save();
    this.database.close();
  }
}
