import type { IpcMain, OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc";
import type {
  ApiSettingsInput,
  ChatEvent,
  ChatRequest,
  DataLocationChangeResult,
  DataLocationChoice,
  EmbeddingProgress,
  ImportProgress,
  ModelListRequest,
  ThemeName
} from "../../shared/types";
import type { AppServices } from "../services/app-services";

interface WindowLike {
  webContents: {
    send(channel: string, payload: unknown): void;
  };
}

interface RegisterHandlerOptions {
  ipcMain: IpcMain;
  services: AppServices;
  getWindow: () => WindowLike | null;
  showOpenDialog?: (
    options: OpenDialogOptions
  ) => Promise<OpenDialogReturnValue>;
  chooseDataLocation?: () => Promise<DataLocationChoice | null>;
  changeDataLocation?: (parentDirectory: string) => Promise<DataLocationChangeResult>;
  applyTheme?: (theme: ThemeName) => void;
}

export function registerIpcHandlers(options: RegisterHandlerOptions): void {
  const { ipcMain, services, getWindow } = options;

  services.setImportProgressListener?.((progress: ImportProgress) => {
    getWindow()?.webContents.send(IPC_CHANNELS.IMPORT_PROGRESS, progress);
  });
  services.setEmbeddingProgressListener?.((progress: EmbeddingProgress) => {
    getWindow()?.webContents.send(IPC_CHANNELS.EMBEDDINGS_PROGRESS, progress);
  });

  ipcMain.handle(IPC_CHANNELS.APP_INFO, () => services.appInfo());
  ipcMain.handle(IPC_CHANNELS.APP_PATHS, () => services.paths());
  ipcMain.handle(IPC_CHANNELS.DATA_LOCATION_CHOOSE, () => {
    if (!options.chooseDataLocation) {
      throw new Error("当前环境未配置资料库位置选择器。");
    }
    return options.chooseDataLocation();
  });
  ipcMain.handle(IPC_CHANNELS.DATA_LOCATION_CHANGE, (_event, parentDirectory: unknown) => {
    if (!options.changeDataLocation) {
      throw new Error("当前环境未配置资料库位置迁移。");
    }
    return options.changeDataLocation(assertString(parentDirectory, "parentDirectory"));
  });
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => services.settings.get());
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, input: ApiSettingsInput) => {
    const saved = await services.settings.save(input);
    options.applyTheme?.(saved.theme);
    return saved;
  });
  ipcMain.handle(IPC_CHANNELS.SETTINGS_TEST_CHAT, () => services.settings.testChat());
  ipcMain.handle(IPC_CHANNELS.SETTINGS_TEST_EMBEDDING, () =>
    services.settings.testEmbedding()
  );
  ipcMain.handle(IPC_CHANNELS.SETTINGS_LIST_MODELS, (_event, request: ModelListRequest) =>
    services.settings.listModels(request)
  );
  ipcMain.handle(IPC_CHANNELS.EMBEDDINGS_STATUS, () => services.getEmbeddingStatus());
  ipcMain.handle(IPC_CHANNELS.EMBEDDINGS_REBUILD, () => services.rebuildEmbeddingIndex());
  ipcMain.handle(IPC_CHANNELS.DOCUMENTS_LIST, () => services.listDocuments());
  ipcMain.handle(IPC_CHANNELS.DOCUMENTS_REMOVE, (_event, documentId: string) =>
    services.removeDocument(assertString(documentId, "documentId"))
  );
  ipcMain.handle(IPC_CHANNELS.DOCUMENTS_TOC, (_event, documentId: string) =>
    services.getDocumentToc(assertString(documentId, "documentId"))
  );
  ipcMain.handle(IPC_CHANNELS.DOCUMENTS_ASSET, (_event, documentId: string) =>
    services.getDocumentAsset(assertString(documentId, "documentId"))
  );
  ipcMain.handle(IPC_CHANNELS.DOCUMENTS_IMPORT_PATHS, (_event, paths: unknown) =>
    services.importPaths(assertStringArray(paths))
  );
  ipcMain.handle(IPC_CHANNELS.DOCUMENTS_IMPORT_DIALOG, async () => {
    if (!options.showOpenDialog) {
      throw new Error("当前环境未配置文件选择器。");
    }
    const result = await options.showOpenDialog({
      title: "导入 STM32 手册资料",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "STM32 资料",
          extensions: ["pdf", "xlsx", "xls", "png", "jpg", "jpeg"]
        }
      ]
    });
    return result.canceled ? [] : services.importPaths(result.filePaths);
  });
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_LIST, () => services.conversations.list());
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_GET, (_event, conversationId: string) =>
    services.conversations.get(assertString(conversationId, "conversationId"))
  );
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_DELETE, (_event, conversationId: string) => {
    services.conversations.delete(assertString(conversationId, "conversationId"));
  });
  ipcMain.handle(IPC_CHANNELS.CHAT_ASK, (_event, request: ChatRequest) =>
    services.chat.ask(assertChatRequest(request), (chatEvent: ChatEvent) => {
      getWindow()?.webContents.send(IPC_CHANNELS.CHAT_EVENT, chatEvent);
    })
  );
  ipcMain.handle(
    IPC_CHANNELS.IMAGES_MATCH,
    (_event, bytes: unknown, documentIds: unknown) =>
      services.matchImage(
        assertBytes(bytes, "bytes"),
        Array.isArray(documentIds) ? documentIds.filter((id): id is string => typeof id === "string") : undefined
      )
  );
}

function assertBytes(value: unknown, name: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new Error(`${name} 必须是图片字节数据。`);
  }
  return value;
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} 无效。`);
  }
  return value;
}

function assertStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("文件路径列表无效。");
  }
  return value;
}

function assertChatRequest(value: unknown): ChatRequest {
  if (!value || typeof value !== "object") {
    throw new Error("聊天请求无效。");
  }
  const request = value as Partial<ChatRequest>;
  return {
    conversationId:
      typeof request.conversationId === "string" ? request.conversationId : undefined,
    question: assertString(request.question, "question"),
    retrievalLimit:
      typeof request.retrievalLimit === "number" ? request.retrievalLimit : undefined
  };
}
