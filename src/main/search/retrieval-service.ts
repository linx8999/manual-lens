import type { Citation, QueryAnalysis, RetrievalBundle } from "../../shared/types";
import type { AppDatabase } from "../storage/database";
import { LexicalSearch } from "./lexical-search";
import { analyzeQuery } from "./query-analyzer";
import { buildRetrievalPlan } from "./query-planner";
import { reciprocalRankFusion, type SearchHit } from "./rrf";
import { rerankHits } from "./retrieval-reranker";
import { SectionIndex, sectionBoost } from "./section-index";
import { VectorSearch } from "./vector-search";

export interface QueryEmbedding {
  vector: Float32Array;
  model: string;
}

interface RetrievalServiceOptions {
  database: AppDatabase;
  embedQuery?: (question: string) => Promise<QueryEmbedding | null>;
}

export class RetrievalService {
  private readonly database: AppDatabase;
  private readonly embedQuery?: (question: string) => Promise<QueryEmbedding | null>;
  private readonly lexical: LexicalSearch;
  private readonly vectors: VectorSearch;
  private readonly sections: SectionIndex;

  constructor(options: RetrievalServiceOptions) {
    this.database = options.database;
    this.embedQuery = options.embedQuery;
    this.lexical = new LexicalSearch(options.database);
    this.vectors = new VectorSearch(options.database);
    this.sections = new SectionIndex(options.database);
  }

  async retrieve(
    question: string,
    limit = 12,
    documentIds?: string[]
  ): Promise<RetrievalBundle> {
    const scope = documentIds && documentIds.length > 0 ? documentIds : undefined;
    const analysis = analyzeQuery(question);
    const plan = buildRetrievalPlan(analysis);
    const warnings: string[] = [];
    const lists: SearchHit[][] = plan.variants.map((variant, index) =>
      this.lexical.search(
        {
          ...analysis,
          normalized: variant.toUpperCase(),
          original: index === 0 ? question : variant
        },
        40,
        scope
      )
    );
    const weights: number[] = plan.weights;
    let embeddingUsed = false;

    if (this.embedQuery) {
      try {
        const expandedQuery = [
          question,
          ...plan.aspects.map((aspect) => aspect.query)
        ].join("\n");
        const embedding = await this.embedQuery(expandedQuery);
        if (embedding) {
          lists.push(this.vectors.search(embedding.vector, 50, embedding.model, scope));
          weights.push(1.15);
          embeddingUsed = true;
        }
      } catch (error) {
        warnings.push(
          `向量检索失败，已使用关键词检索：${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      warnings.push("尚未配置向量模型，本次仅使用关键词与结构检索。");
    }

    const sectionMatches = this.sections.match(analysis.keywords, scope);
    const ranked = rerankHits(
      reciprocalRankFusion(lists, 60, weights).map((hit) => ({
        ...hit,
        score:
          hit.score +
          structuralBoost(hit, analysis) +
          aspectBoost(hit, plan.aspects) +
          sectionBoost(sectionMatches, hit.documentId, hit.pageNumber)
      })),
      analysis,
      plan
    )
      .slice(0, Math.min(limit, 8));

    if (ranked.length === 0) {
      warnings.push("知识库中没有找到足够相关的资料。");
    }

    return {
      question,
      analysis,
      sources: ranked.map((hit, index) => toCitation(hit, index + 1)),
      embeddingUsed,
      warnings
    };
  }
}

function aspectBoost(
  hit: SearchHit,
  aspects: ReturnType<typeof buildRetrievalPlan>["aspects"]
): number {
  const haystack = `${hit.heading ?? ""}\n${hit.text}`.toUpperCase();
  let boost = 0;
  for (const aspect of aspects) {
    const heading = (hit.heading ?? "").toUpperCase();
    const headingMatches = aspect.keywords.filter((keyword) =>
      heading.includes(keyword.toUpperCase())
    ).length;
    const matches = aspect.keywords.filter((keyword) =>
      haystack.includes(keyword.toUpperCase())
    ).length;
    if (headingMatches > 0) {
      boost += Math.min(0.45, headingMatches * 0.32);
    }
    if (matches > 0) {
      boost += Math.min(0.24, matches * 0.06);
    }
  }
  return boost;
}

function structuralBoost(hit: SearchHit, analysis: QueryAnalysis): number {
  const haystack = `${hit.documentTitle}\n${hit.heading ?? ""}\n${hit.text}`.toUpperCase();
  let boost = 0;

  for (const identifier of analysis.identifiers) {
    if (haystack.includes(identifier)) {
      boost += 0.035;
    }
  }
  for (const peripheral of analysis.peripherals) {
    if (haystack.includes(peripheral)) {
      boost += 0.02;
    }
  }
  for (const chip of analysis.chipModels) {
    if (haystack.includes(chip)) {
      boost += 0.02;
    }
  }
  if (hit.heading && analysis.identifiers.some((identifier) => hit.heading?.includes(identifier))) {
    boost += 0.04;
  }

  return boost;
}

function toCitation(hit: SearchHit, index: number): Citation {
  return {
    sourceId: `S${index}`,
    documentId: hit.documentId,
    documentTitle: hit.documentTitle,
    chunkId: hit.chunkId,
    pageNumber: hit.pageNumber,
    printedPage: hit.printedPage,
    heading: hit.heading,
    excerpt: excerpt(hit.text),
    score: hit.score
  };
}

function excerpt(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 420 ? `${normalized.slice(0, 417)}...` : normalized;
}
