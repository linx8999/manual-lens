import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  ApiConnectionResult,
  ApiSettings,
  ApiSettingsInput,
  AppInfo,
  AppPaths,
  ChatEvent,
  ChatMessage,
  ChatRequest,
  ChatStartResult,
  ConversationDetail,
  ConversationSummary,
  DataLocationChangeResult,
  DataLocationChoice,
  DocumentAsset,
  DocumentSummary,
  EmbeddingIndexStatus,
  EmbeddingProgress,
  ImageMatchResult,
  ImportProgress,
  ImportResult,
  ModelListRequest,
  ModelListResult,
  TocNode
} from "../shared/types";

export interface DesktopApi {
  app: {
    getInfo(): Promise<AppInfo>;
    getPaths(): Promise<AppPaths>;
  };
  knowledge: {
    chooseLocation(): Promise<DataLocationChoice | null>;
    changeLocation(parentDirectory: string): Promise<DataLocationChangeResult>;
  };
  settings: {
    get(): Promise<ApiSettings>;
    save(input: ApiSettingsInput): Promise<ApiSettings>;
    testChat(): Promise<ApiConnectionResult>;
    testEmbedding(): Promise<ApiConnectionResult>;
    listModels(request: ModelListRequest): Promise<ModelListResult>;
  };
  documents: {
    list(): Promise<DocumentSummary[]>;
    importDialog(): Promise<ImportResult[]>;
    importPaths(paths: string[]): Promise<ImportResult[]>;
    remove(documentId: string): Promise<void>;
    toc(documentId: string): Promise<TocNode[]>;
    asset(documentId: string): Promise<DocumentAsset>;
  };
  importJobs: {
    onProgress(callback: (progress: ImportProgress) => void): () => void;
  };
  conversations: {
    list(): Promise<ConversationSummary[]>;
    get(conversationId: string): Promise<ConversationDetail>;
    delete(conversationId: string): Promise<void>;
  };
  chat: {
    ask(request: ChatRequest): Promise<ChatStartResult>;
    onEvent(callback: (event: ChatEvent) => void): () => void;
  };
  images: {
    match(bytes: Uint8Array, documentIds?: string[]): Promise<ImageMatchResult>;
  };
  embeddings: {
    status(): Promise<EmbeddingIndexStatus>;
    rebuild(): Promise<EmbeddingIndexStatus>;
    onProgress(callback: (progress: EmbeddingProgress) => void): () => void;
  };
}

export function createDesktopApi(): DesktopApi {
  return {
    app: {
      getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_INFO) as Promise<AppInfo>,
      getPaths: () => ipcRenderer.invoke(IPC_CHANNELS.APP_PATHS) as Promise<AppPaths>
    },
    knowledge: {
      chooseLocation: () =>
        ipcRenderer.invoke(
          IPC_CHANNELS.DATA_LOCATION_CHOOSE
        ) as Promise<DataLocationChoice | null>,
      changeLocation: (parentDirectory) =>
        ipcRenderer.invoke(
          IPC_CHANNELS.DATA_LOCATION_CHANGE,
          parentDirectory
        ) as Promise<DataLocationChangeResult>
    },
    settings: {
      get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET) as Promise<ApiSettings>,
      save: (input) =>
        ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, input) as Promise<ApiSettings>,
      testChat: () =>
        ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_TEST_CHAT) as Promise<ApiConnectionResult>,
      testEmbedding: () =>
        ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_TEST_EMBEDDING) as Promise<ApiConnectionResult>,
      listModels: (request) =>
        ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_LIST_MODELS, request) as Promise<ModelListResult>
    },
    documents: {
      list: () =>
        ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_LIST) as Promise<DocumentSummary[]>,
      importDialog: () =>
        ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_IMPORT_DIALOG) as Promise<ImportResult[]>,
      importPaths: (paths) =>
        ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_IMPORT_PATHS, paths) as Promise<ImportResult[]>,
      remove: (documentId) =>
        ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_REMOVE, documentId) as Promise<void>,
      toc: (documentId) =>
        ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_TOC, documentId) as Promise<TocNode[]>,
      asset: (documentId) =>
        ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_ASSET, documentId) as Promise<DocumentAsset>
    },
    importJobs: {
      onProgress: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: ImportProgress): void => {
          callback(progress);
        };
        ipcRenderer.on(IPC_CHANNELS.IMPORT_PROGRESS, listener);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.IMPORT_PROGRESS, listener);
      }
    },
    conversations: {
      list: () =>
        ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_LIST) as Promise<ConversationSummary[]>,
      get: (conversationId) =>
        ipcRenderer.invoke(
          IPC_CHANNELS.CONVERSATIONS_GET,
          conversationId
        ) as Promise<ConversationDetail>,
      delete: (conversationId) =>
        ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_DELETE, conversationId) as Promise<void>
    },
    chat: {
      ask: (request: ChatRequest) =>
        ipcRenderer.invoke(IPC_CHANNELS.CHAT_ASK, request) as Promise<ChatStartResult>,
      onEvent: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: ChatEvent): void => {
          callback(payload);
        };
        ipcRenderer.on(IPC_CHANNELS.CHAT_EVENT, listener);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_EVENT, listener);
      }
    },
    images: {
      match: (bytes, documentIds) =>
        ipcRenderer.invoke(
          IPC_CHANNELS.IMAGES_MATCH,
          bytes,
          documentIds
        ) as Promise<ImageMatchResult>
    },
    embeddings: {
      status: () =>
        ipcRenderer.invoke(IPC_CHANNELS.EMBEDDINGS_STATUS) as Promise<EmbeddingIndexStatus>,
      rebuild: () =>
        ipcRenderer.invoke(IPC_CHANNELS.EMBEDDINGS_REBUILD) as Promise<EmbeddingIndexStatus>,
      onProgress: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: EmbeddingProgress): void => {
          callback(progress);
        };
        ipcRenderer.on(IPC_CHANNELS.EMBEDDINGS_PROGRESS, listener);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.EMBEDDINGS_PROGRESS, listener);
      }
    }
  };
}

export type ChatMessageRecord = ChatMessage;
