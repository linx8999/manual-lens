export type DocumentKind = "pdf" | "xlsx" | "image";
export type DocumentStatus = "pending" | "indexing" | "ready" | "error";
export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "complete" | "error";
export type ThemeName = "obsidian" | "blue" | "white";

export interface AppInfo {
  name: string;
  version: string;
}

export interface AppPaths {
  dataRoot: string;
  library: string;
  index: string;
  cache: string;
  logs: string;
  backups: string;
}

export interface DataLocationChoice {
  currentDataRoot: string;
  parentDirectory: string;
  targetDataRoot: string;
}

export interface DataLocationChangeResult {
  dataRoot: string;
  restarting: boolean;
}

export interface QueryAnalysis {
  original: string;
  normalized: string;
  keywords: string[];
  chipModels: string[];
  peripherals: string[];
  identifiers: string[];
  aliases: string[];
  intent: "configure" | "register" | "parameter" | "pin" | "troubleshoot" | "general";
}

export interface DocumentSummary {
  id: string;
  title: string;
  originalFilename: string;
  kind: DocumentKind;
  pageCount: number;
  indexedChunkCount: number;
  indexCoverage: "content" | "metadata" | "none";
  status: DocumentStatus;
  sha256: string;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TocNode {
  id: string;
  documentId: string;
  parentId: string | null;
  title: string;
  level: number;
  pageNumber: number;
  printedPage: string | null;
}

export interface Citation {
  sourceId: string;
  documentId: string;
  documentTitle: string;
  chunkId: string;
  pageNumber: number;
  printedPage: string | null;
  heading: string | null;
  excerpt: string;
  score: number;
}

export interface RetrievalBundle {
  question: string;
  analysis: QueryAnalysis;
  sources: Citation[];
  embeddingUsed: boolean;
  warnings: string[];
}

export interface ChatRequest {
  conversationId?: string;
  question: string;
  retrievalLimit?: number;
  /** Restricts retrieval to these documents. Empty/undefined means all. */
  documentIds?: string[];
  /** Optional attached screenshot, sent to the model with the question. */
  imageDataUrl?: string;
}

export interface ImageMatchCandidate {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  printedPage: string | null;
  heading: string | null;
  score: number;
  excerpt: string;
}

export interface ImageMatchResult {
  matched: boolean;
  confidence: number;
  ocrText: string;
  candidates: ImageMatchCandidate[];
  warnings: string[];
}

export interface ChatStartResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  retrieval: RetrievalBundle;
}

export interface ChatEvent {
  conversationId: string;
  messageId: string;
  type: "delta" | "replace" | "sources" | "complete" | "error";
  delta?: string;
  content?: string;
  citations?: Citation[];
  error?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  citations: Citation[];
  createdAt: number;
}

export interface ConversationDetail {
  id: string;
  title: string;
  messages: ChatMessage[];
}

export interface ApiSettings {
  chatBaseUrl: string;
  chatModel: string;
  embeddingBaseUrl: string;
  embeddingModel: string;
  chatApiKeyConfigured: boolean;
  embeddingApiKeyConfigured: boolean;
  requestTimeoutMs: number;
  theme: ThemeName;
  /** How a pasted screenshot is turned into text before page matching. */
  imageEngine: ImageEngine;
}

export type ImageEngine = "vision" | "local";

export interface ApiSettingsInput {
  chatBaseUrl: string;
  chatModel: string;
  embeddingBaseUrl: string;
  embeddingModel: string;
  chatApiKey?: string;
  embeddingApiKey?: string;
  requestTimeoutMs?: number;
  theme?: ThemeName;
  imageEngine?: ImageEngine;
}

export interface ModelListRequest {
  baseUrl: string;
  apiKey?: string;
  secretKind: "chat" | "embedding";
  timeoutMs?: number;
}

export interface ModelListResult {
  models: string[];
}

export interface EmbeddingIndexStatus {
  configured: boolean;
  model: string;
  indexed: number;
  total: number;
  staged: number;
  complete: boolean;
  indexedAt: number | null;
}

export interface EmbeddingProgress {
  model: string;
  completed: number;
  total: number;
  message: string;
}

export interface ApiConnectionResult {
  ok: boolean;
  message: string;
}

export interface ImportProgress {
  jobId: string;
  filename: string;
  stage: "hash" | "extract" | "chunk" | "index" | "embed" | "complete" | "error";
  completed: number;
  total: number;
  message: string;
}

export interface ImportResult {
  filename: string;
  status: "imported" | "duplicate" | "failed";
  documentId?: string;
  duplicateOf?: string;
  error?: string;
  warning?: string;
}

export interface WorkbookSheet {
  name: string;
  rows: Array<Array<string | number | boolean | null>>;
  pageNumber: number;
}

export interface DocumentAsset {
  kind: DocumentKind;
  bytes?: Uint8Array;
  sheets?: WorkbookSheet[];
  mimeType?: string;
}

export interface ImportManifestItem {
  title: string;
  sourcePath: string;
  kind: DocumentKind;
}
