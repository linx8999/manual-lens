import type { EmbeddingResult } from "../api/openai-client";
import type { AppDatabase } from "../storage/database";
import type { EmbeddingIndexStatus, EmbeddingProgress } from "../../shared/types";

export interface EmbeddingRuntime {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

interface EmbeddingClient {
  embed(request: {
    baseUrl: string;
    apiKey: string;
    model: string;
    input: string[];
    timeoutMs?: number;
  }): Promise<EmbeddingResult>;
}

interface EmbeddingIndexOptions {
  database: AppDatabase;
  runtimeProvider: () => Promise<EmbeddingRuntime>;
  client: EmbeddingClient;
  batchSize?: number;
}

interface ChunkRow {
  id: string;
  heading: string | null;
  text: string;
  document_title: string;
}

export class EmbeddingIndexService {
  private readonly database: AppDatabase;
  private readonly runtimeProvider: () => Promise<EmbeddingRuntime>;
  private readonly client: EmbeddingClient;
  private readonly batchSize: number;

  constructor(options: EmbeddingIndexOptions) {
    this.database = options.database;
    this.runtimeProvider = options.runtimeProvider;
    this.client = options.client;
    this.batchSize = options.batchSize ?? 32;
  }

  async status(): Promise<EmbeddingIndexStatus> {
    const runtime = await this.runtimeProvider();
    const total = this.count("SELECT COUNT(*) AS count FROM chunks");
    if (!runtime.baseUrl || !runtime.apiKey || !runtime.model) {
      return {
        configured: false,
        model: runtime.model,
        indexed: 0,
        total,
        staged: 0,
        complete: false,
        indexedAt: null
      };
    }
    const indexed = this.count(
      "SELECT COUNT(*) AS count FROM embeddings WHERE model = ?",
      runtime.model
    );
    const staged = this.count(
      "SELECT COUNT(*) AS count FROM embedding_build WHERE model = ?",
      runtime.model
    );
    const indexedAt = this.database.query<{ value: string }>(
      "SELECT value FROM schema_meta WHERE key = 'embedding_indexed_at'"
    )[0]?.value;
    return {
      configured: true,
      model: runtime.model,
      indexed,
      total,
      staged,
      complete: total > 0 && indexed === total,
      indexedAt: indexedAt ? Number(indexedAt) : null
    };
  }

  async rebuild(onProgress?: (progress: EmbeddingProgress) => void): Promise<EmbeddingIndexStatus> {
    const runtime = await this.runtimeProvider();
    if (!runtime.baseUrl || !runtime.apiKey || !runtime.model) {
      throw new Error("请先配置并保存可用的向量模型与 API Key。");
    }

    const total = this.count("SELECT COUNT(*) AS count FROM chunks");
    if (total === 0) {
      throw new Error("知识库还没有可向量化的文本块。");
    }

    this.database.run("DELETE FROM embedding_build WHERE model <> ?", runtime.model);
    this.database.run(
      `INSERT OR IGNORE INTO embedding_build (
        chunk_id, model, dimensions, vector, created_at
      )
      SELECT chunk_id, model, dimensions, vector, created_at
      FROM embeddings
      WHERE model = ?`,
      runtime.model
    );

    let dimensions: number | null = null;
    let completed = this.count(
      "SELECT COUNT(*) AS count FROM embedding_build WHERE model = ?",
      runtime.model
    );
    onProgress?.({
      model: runtime.model,
      completed,
      total,
      message: completed > 0 ? "从已有向量继续构建" : "开始生成向量"
    });

    while (completed < total) {
      const rows = this.database.query<ChunkRow>(
        `SELECT
           c.id,
           c.heading,
           c.text,
           d.title AS document_title
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
         LEFT JOIN embedding_build b
           ON b.chunk_id = c.id AND b.model = ?
         WHERE b.chunk_id IS NULL
         ORDER BY c.rowid
         LIMIT ?`,
        runtime.model,
        this.batchSize
      );
      if (rows.length === 0) {
        break;
      }

      const inputs = rows.map((row) =>
        [row.document_title, row.heading, row.text].filter(Boolean).join("\n")
      );
      const result = await this.client.embed({
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
        model: runtime.model,
        input: inputs,
        timeoutMs: runtime.timeoutMs
      });
      if (result.vectors.length !== rows.length) {
        throw new Error(
          `向量接口返回数量不匹配：需要 ${rows.length} 个，实际 ${result.vectors.length} 个。`
        );
      }

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        const vector = result.vectors[index]!;
        if (vector.length === 0) {
          throw new Error(`文本块 ${row.id} 返回了空向量。`);
        }
        dimensions ??= vector.length;
        if (vector.length !== dimensions) {
          throw new Error(
            `向量维度不一致：首批为 ${dimensions}，当前为 ${vector.length}。`
          );
        }
      }

      this.database.transaction(() => {
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index]!;
          const vector = result.vectors[index]!;
          this.database.run(
            `INSERT OR REPLACE INTO embedding_build (
              chunk_id, model, dimensions, vector, created_at
            ) VALUES (?, ?, ?, ?, ?)`,
            row.id,
            runtime.model,
            vector.length,
            new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength),
            Date.now()
          );
        }
      });
      completed += rows.length;
      onProgress?.({
        model: runtime.model,
        completed: Math.min(completed, total),
        total,
        message: `已生成 ${Math.min(completed, total)} / ${total} 个文本块`
      });
    }

    const staged = this.count(
      "SELECT COUNT(*) AS count FROM embedding_build WHERE model = ?",
      runtime.model
    );
    if (staged !== total) {
      throw new Error(`向量构建未完成：${staged} / ${total}。`);
    }

    const indexedAt = Date.now();
    this.database.transaction(() => {
      this.database.run("DELETE FROM embeddings");
      this.database.run(
        `INSERT INTO embeddings (
          chunk_id, model, dimensions, vector, created_at
        )
        SELECT chunk_id, model, dimensions, vector, created_at
        FROM embedding_build
        WHERE model = ?`,
        runtime.model
      );
      this.database.run("DELETE FROM embedding_build");
      this.database.run(
        "INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('embedding_model', ?)",
        runtime.model
      );
      this.database.run(
        "INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('embedding_indexed_at', ?)",
        String(indexedAt)
      );
    });

    onProgress?.({
      model: runtime.model,
      completed: total,
      total,
      message: "向量索引构建完成"
    });
    return this.status();
  }

  private count(sql: string, ...params: Array<string>): number {
    return (
      this.database.query<{ count: number }>(sql, ...params)[0]?.count ?? 0
    );
  }
}
