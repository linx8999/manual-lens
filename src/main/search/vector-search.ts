import type { AppDatabase } from "../storage/database";
import type { SearchHit } from "./rrf";

interface VectorRow {
  chunk_id: string;
  document_id: string;
  document_title: string;
  page_number: number;
  printed_page: string | null;
  heading: string | null;
  text: string;
  vector: Uint8Array;
}

interface ScoredVectorRow extends VectorRow {
  similarity: number;
}

export class VectorSearch {
  constructor(private readonly database: AppDatabase) {}

  search(
    queryVector: Float32Array,
    limit = 60,
    model?: string,
    documentIds?: string[]
  ): SearchHit[] {
    const scope = documentIds && documentIds.length > 0 ? documentIds : null;
    const rows = this.database.query<VectorRow>(
      `SELECT
         e.chunk_id,
         c.document_id,
         d.title AS document_title,
         c.page_number,
         p.printed_page,
         c.heading,
         c.text,
         e.vector
       FROM embeddings e
       JOIN chunks c ON c.id = e.chunk_id
       JOIN documents d ON d.id = c.document_id
       LEFT JOIN pages p
         ON p.document_id = c.document_id AND p.page_number = c.page_number
       WHERE e.dimensions = ? ${model ? "AND e.model = ?" : ""}${
         scope ? ` AND c.document_id IN (${scope.map(() => "?").join(", ")})` : ""
       }`,
      queryVector.length,
      ...(model ? [model] : []),
      ...(scope ?? [])
    );

    const queryNorm = vectorNorm(queryVector);
    const scored: ScoredVectorRow[] = rows.map((row) => {
      const vector = bytesToFloat32(row.vector);
      const similarity =
        queryNorm === 0 || vector.length !== queryVector.length
          ? -1
          : dotProduct(queryVector, vector) / (queryNorm * vectorNorm(vector));
      return { ...row, similarity };
    });

    return scored
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit)
      .map((row, index) => ({
        chunkId: row.chunk_id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        pageNumber: row.page_number,
        printedPage: row.printed_page,
        heading: row.heading,
        text: row.text,
        score: row.similarity,
        rank: index + 1
      }));
  }
}

function bytesToFloat32(bytes: Uint8Array): Float32Array {
  const copy = Uint8Array.from(bytes);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

function dotProduct(left: Float32Array, right: Float32Array): number {
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return result;
}

function vectorNorm(vector: Float32Array): number {
  return Math.sqrt(dotProduct(vector, vector));
}
