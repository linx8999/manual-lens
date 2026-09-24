import type { SecretCipher } from "../security/secret-store";
import { SecretStore } from "../security/secret-store";
import { SettingsStore, type PersistedSettings } from "../storage/settings-store";
import { ensureDataPaths } from "../config/paths";
import { AppDatabase } from "../storage/database";
import { ensureSearchIndex } from "../search/search-index";
import { ImageMatcher } from "../vision/image-matcher";
import { transcribeWithVision } from "../vision/vision-ocr";
import { ImportService } from "../ingestion/import-service";
import { LibraryService } from "../library/library-service";
import { ConversationStore } from "../chat/conversation-store";
import { ChatService } from "../chat/chat-service";
import { OpenAIClient } from "../api/openai-client";
import { testChatConnection, testEmbeddingConnection } from "../api/api-test-service";
import { chooseEmbeddingModel, extractSupportedModels } from "../api/model-utils";
import { RetrievalService, type QueryEmbedding } from "../search/retrieval-service";
import { EmbeddingIndexService } from "../embeddings/embedding-index-service";
import type {
  ApiConnectionResult,
  ApiSettings,
  ApiSettingsInput,
  AppPaths,
  DocumentAsset,
  DocumentSummary,
  EmbeddingIndexStatus,
  EmbeddingProgress,
  ImportProgress,
  ImageMatchResult,
  ImportResult,
  ModelListRequest,
  ModelListResult,
  TocNode
} from "../../shared/types";
import { APP_NAME, APP_VERSION } from "../../shared/constants";
import { readLibraryManifest } from "../ingestion/library-manifest";

interface AppServicesOptions {
  dataRoot: string;
  secretCipher: SecretCipher;
  client?: OpenAIClient;
}

export class AppServices {
  readonly database: AppDatabase;
  readonly pathsValue: AppPaths;
  readonly settingsStore: SettingsStore;
  readonly secrets: SecretStore;
  readonly importer: ImportService;
  readonly library: LibraryService;
  readonly conversations: ConversationStore;
  readonly chat: ChatService;
  readonly retrieval: RetrievalService;
  readonly embeddings: EmbeddingIndexService;
  readonly settings: {
    get(): Promise<ApiSettings>;
    save(input: ApiSettingsInput): Promise<ApiSettings>;
    testChat(): Promise<ApiConnectionResult>;
    testEmbedding(): Promise<ApiConnectionResult>;
    listModels(request: ModelListRequest): Promise<ModelListResult>;
  };
  private readonly client: OpenAIClient;
  private readonly imageMatcher: ImageMatcher;
  private progressTarget: ((progress: ImportProgress) => void) | null = null;
  private embeddingProgressTarget: ((progress: EmbeddingProgress) => void) | null = null;

  private constructor(options: AppServicesOptions, database: AppDatabase, paths: AppPaths) {
    this.database = database;
    this.pathsValue = paths;
    this.settingsStore = new SettingsStore(options.dataRoot);
    this.secrets = new SecretStore(options.dataRoot, options.secretCipher);
    this.importer = new ImportService({ dataRoot: options.dataRoot, database });
    this.library = new LibraryService({ dataRoot: options.dataRoot, database });
    this.conversations = new ConversationStore(database);
    this.client = options.client ?? new OpenAIClient();
    this.imageMatcher = new ImageMatcher(database);

    this.settings = {
      get: () => this.getApiSettings(),
      save: (input) => this.saveApiSettings(input),
      testChat: () => this.testChat(),
      testEmbedding: () => this.testEmbedding(),
      listModels: (request) => this.listModels(request)
    };

    const embedQuery = async (question: string): Promise<QueryEmbedding | null> => {
      const settings = await this.getApiSettings();
      const apiKey = await this.secrets.getApiKey("embedding");
      if (!apiKey || !settings.embeddingModel) {
        return null;
      }
      const embed = (model: string) =>
        this.client.embed({
          baseUrl: settings.embeddingBaseUrl,
          apiKey,
          model,
          input: [question],
          timeoutMs: settings.requestTimeoutMs
        });
      let result;
      try {
        result = await embed(settings.embeddingModel);
      } catch (error) {
        const advertised = extractSupportedModels(
          error instanceof Error ? error.message : String(error)
        );
        const fallback = chooseEmbeddingModel(advertised);
        if (!fallback || fallback === settings.embeddingModel) {
          throw error;
        }
        await this.settingsStore.save({ ...settings, embeddingModel: fallback });
        result = await embed(fallback);
      }
      const vector = result.vectors[0];
      return vector ? { vector, model: result.model } : null;
    };

    this.retrieval = new RetrievalService({ database, embedQuery });
    this.embeddings = new EmbeddingIndexService({
      database,
      client: this.client,
      runtimeProvider: async () => {
        const settings = await this.settingsStore.load();
        return {
          baseUrl: settings.embeddingBaseUrl,
          apiKey: (await this.secrets.getApiKey("embedding")) ?? "",
          model: settings.embeddingModel,
          timeoutMs: settings.requestTimeoutMs
        };
      }
    });
    this.chat = new ChatService({
      database,
      conversations: this.conversations,
      retrieval: this.retrieval,
      client: this.client,
      runtimeProvider: async () => {
        const settings = await this.getApiSettings();
        return {
          settings,
          chatApiKey: await this.secrets.getApiKey("chat"),
          embeddingApiKey: await this.secrets.getApiKey("embedding"),
          embedQuery,
          updateChatModel: async (model) => {
            const current = await this.settingsStore.load();
            await this.settingsStore.save({ ...current, chatModel: model });
          }
        };
      }
    });
  }

  static async create(options: AppServicesOptions): Promise<AppServices> {
    const paths = await ensureDataPaths(options.dataRoot);
    const database = await AppDatabase.open(options.dataRoot);
    ensureSearchIndex(database);
    return new AppServices(options, database, paths);
  }

  appInfo(): { name: string; version: string } {
    return { name: APP_NAME, version: APP_VERSION };
  }

  paths(): AppPaths {
    return this.pathsValue;
  }

  async matchImage(bytes: Uint8Array, documentIds?: string[]): Promise<ImageMatchResult> {
    const settings = await this.settings.get();
    if (settings.imageEngine === "vision" && settings.chatApiKeyConfigured) {
      const apiKey = await this.secrets.getApiKey("chat").catch(() => null);
      if (apiKey) {
        const visionText = await transcribeWithVision(
          {
            baseUrl: settings.chatBaseUrl,
            apiKey,
            model: settings.chatModel,
            timeoutMs: settings.requestTimeoutMs
          },
          bytes
        );
        if (visionText) {
          // The vision model already transcribed it; reuse the same ranking.
          return this.imageMatcher.match(bytes, documentIds, async () => visionText);
        }
      }
    }
    return this.imageMatcher.match(bytes, documentIds);
  }

  setImportProgressListener(listener: ((progress: ImportProgress) => void) | null): void {
    this.progressTarget = listener;
    this.importer.setProgressListener(listener);
  }

  setEmbeddingProgressListener(
    listener: ((progress: EmbeddingProgress) => void) | null
  ): void {
    this.embeddingProgressTarget = listener;
  }

  getEmbeddingStatus(): Promise<EmbeddingIndexStatus> {
    return this.embeddings.status();
  }

  rebuildEmbeddingIndex(): Promise<EmbeddingIndexStatus> {
    return this.embeddings.rebuild((progress) => {
      this.embeddingProgressTarget?.(progress);
    });
  }

  async importPaths(paths: string[]): Promise<ImportResult[]> {
    const results = await this.importer.importPaths(paths);
    const imported = results.filter((result) => result.status === "imported");
    if (imported.length === 0) {
      return results;
    }

    let embeddingStatus: EmbeddingIndexStatus;
    try {
      embeddingStatus = await this.embeddings.status();
    } catch (error) {
      return addImportWarning(
        results,
        `全文检索已就绪；无法检查向量索引：${messageOf(error)}`
      );
    }

    if (!embeddingStatus.configured) {
      return addImportWarning(
        results,
        "全文检索已就绪；未配置向量模型，当前使用关键词与结构检索。"
      );
    }

    try {
      const autoJobId = `embedding-auto-${Date.now()}`;
      await this.embeddings.rebuild((progress) => {
        this.embeddingProgressTarget?.(progress);
        this.progressTarget?.({
          jobId: autoJobId,
          filename: "新资料向量索引",
          stage: "embed",
          completed: progress.completed,
          total: progress.total,
          message: progress.message
        });
      });
    } catch (error) {
      return addImportWarning(
        results,
        `全文检索已就绪；向量索引自动补建失败，当前仍可使用关键词检索：${messageOf(error)}`
      );
    }

    return results;
  }

  async seedIfNeeded(manifestPath: string): Promise<ImportResult[]> {
    if ((await this.listDocuments()).length > 0) {
      return [];
    }
    const manifest = await readLibraryManifest(manifestPath);
    return this.importPaths(manifest.map((item) => item.sourcePath));
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    return this.library.list();
  }

  async removeDocument(documentId: string): Promise<void> {
    return this.library.remove(documentId);
  }

  async getDocumentToc(documentId: string): Promise<TocNode[]> {
    return this.library.getToc(documentId);
  }

  async getDocumentAsset(documentId: string): Promise<DocumentAsset> {
    return this.library.getAsset(documentId);
  }

  close(): void {
    this.database.close();
  }

  private async getApiSettings(): Promise<ApiSettings> {
    const persisted = await this.settingsStore.load();
    const [chatConfigured, embeddingConfigured] = await Promise.all([
      this.secrets.hasApiKey("chat"),
      this.secrets.hasApiKey("embedding")
    ]);
    return {
      ...persisted,
      chatApiKeyConfigured: chatConfigured,
      embeddingApiKeyConfigured: embeddingConfigured
    };
  }

  private async saveApiSettings(input: ApiSettingsInput): Promise<ApiSettings> {
    await this.settingsStore.save(input);
    if (input.chatApiKey?.trim()) {
      await this.secrets.setApiKey("chat", input.chatApiKey.trim());
    }
    if (input.embeddingApiKey?.trim()) {
      await this.secrets.setApiKey("embedding", input.embeddingApiKey.trim());
    }
    return this.getApiSettings();
  }

  private async testChat(): Promise<ApiConnectionResult> {
    const settings = await this.getApiSettings();
    const apiKey = await this.secrets.getApiKey("chat");
    if (!apiKey) {
      return { ok: false, message: "请先填写聊天 API Key。" };
    }
    return testChatConnection(settings, apiKey);
  }

  private async testEmbedding(): Promise<ApiConnectionResult> {
    const settings = await this.getApiSettings();
    const apiKey = await this.secrets.getApiKey("embedding");
    if (!apiKey) {
      return { ok: false, message: "请先填写向量 API Key。" };
    }
    return testEmbeddingConnection(settings, apiKey);
  }

  private async listModels(request: ModelListRequest): Promise<ModelListResult> {
    const suppliedKey = request.apiKey?.trim();
    const apiKey = suppliedKey || (await this.secrets.getApiKey(request.secretKind));
    if (!apiKey) {
      throw new Error("请先填写或保存 API Key。");
    }
    const models = await this.client.listModels({
      baseUrl: request.baseUrl,
      apiKey,
      timeoutMs: request.timeoutMs
    });
    return { models };
  }
}

export type { PersistedSettings };

function addImportWarning(results: ImportResult[], warning: string): ImportResult[] {
  return results.map((result) =>
    result.status === "imported"
      ? {
          ...result,
          warning: result.warning ? `${result.warning} ${warning}` : warning
        }
      : result
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
