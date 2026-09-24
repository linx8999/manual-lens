import { createStore } from "zustand/vanilla";
import type { DesktopApi } from "../../../preload/api";
import type {
  ApiSettings,
  AppInfo,
  AppPaths,
  ChatEvent,
  ChatMessage,
  ConversationSummary,
  DocumentAsset,
  DocumentSummary,
  ImportProgress,
  RetrievalBundle,
  TocNode
} from "../../../shared/types";

export interface ReaderState {
  documentId: string | null;
  documentTitle: string;
  pageCount: number;
  pageNumber: number;
  printedPage: string | null;
  heading: string | null;
  excerpt: string | null;
  toc: TocNode[];
  asset: DocumentAsset | null;
  loading: boolean;
  error: string | null;
}

export interface AppState {
  appInfo: AppInfo | null;
  paths: AppPaths | null;
  settings: ApiSettings | null;
  documents: DocumentSummary[];
  /** Empty means "search every document". */
  selectedDocumentIds: string[];
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  retrieval: RetrievalBundle | null;
  streamingMessageId: string | null;
  reader: ReaderState;
  loading: boolean;
  importing: boolean;
  movingData: boolean;
  importProgress: ImportProgress | null;
  settingsOpen: boolean;
  libraryOpen: boolean;
  error: string | null;
  notice: string | null;
  bootstrap(): Promise<void>;
  reloadSettings(): Promise<void>;
  reloadDocuments(): Promise<void>;
  reloadConversations(): Promise<void>;
  newConversation(): void;
  loadConversation(conversationId: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  sendQuestion(question: string, imageDataUrl?: string): Promise<void>;
  applyChatEvent(event: ChatEvent): void;
  importDialog(): Promise<void>;
  changeDataLocation(): Promise<void>;
  removeDocument(documentId: string): Promise<void>;
  openDocument(
    documentId: string,
    pageNumber?: number,
    excerpt?: string | null,
    heading?: string | null,
    printedPage?: string | null
  ): Promise<void>;
  setReaderPage(pageNumber: number): void;
  closeReader(): void;
  setSettingsOpen(open: boolean): void;
  setLibraryOpen(open: boolean): void;
  toggleDocumentSelected(documentId: string): void;
  selectAllDocuments(): void;
  clearDocumentSelection(): void;
  dispose(): void;
}

const SELECTED_DOCUMENTS_KEY = "selectedDocumentIds";

function loadSelectedDocuments(): string[] {
  try {
    const raw = localStorage.getItem(SELECTED_DOCUMENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function persistSelectedDocuments(ids: string[]): void {
  try {
    localStorage.setItem(SELECTED_DOCUMENTS_KEY, JSON.stringify(ids));
  } catch {
    // Selection is a convenience; ignore storage failures.
  }
}

const EMPTY_READER: ReaderState = {
  documentId: null,
  documentTitle: "",
  pageCount: 0,
  pageNumber: 1,
  printedPage: null,
  heading: null,
  excerpt: null,
  toc: [],
  asset: null,
  loading: false,
  error: null
};

export function createAppStore(api: DesktopApi) {
  return createStore<AppState>((set, get) => {
    let disposeChat = (): void => undefined;
    let disposeImport = (): void => undefined;

    const refresh = async (): Promise<void> => {
      const [settings, documents, conversations] = await Promise.all([
        api.settings.get(),
        api.documents.list(),
        api.conversations.list()
      ]);
      set((state) => {
        const available = new Set(documents.map((document) => document.id));
        const selectedDocumentIds = state.selectedDocumentIds.filter((id) =>
          available.has(id)
        );
        persistSelectedDocuments(selectedDocumentIds);
        return { settings, documents, conversations, selectedDocumentIds };
      });
    };

    return {
      appInfo: null,
      paths: null,
      settings: null,
      documents: [],
      selectedDocumentIds: loadSelectedDocuments(),
      conversations: [],
      activeConversationId: null,
      messages: [],
      retrieval: null,
      streamingMessageId: null,
      reader: { ...EMPTY_READER },
      loading: true,
      importing: false,
      movingData: false,
      importProgress: null,
      settingsOpen: false,
      libraryOpen: false,
      error: null,
      notice: null,

      async bootstrap() {
        set({ loading: true, error: null });
        try {
          const [appInfo, paths] = await Promise.all([api.app.getInfo(), api.app.getPaths()]);
          await refresh();
          disposeChat = api.chat.onEvent((event) => get().applyChatEvent(event));
          disposeImport = api.importJobs.onProgress((progress) => {
            set({ importProgress: progress });
            if (progress.stage === "complete") {
              void get().reloadDocuments();
              setTimeout(() => {
                if (get().importProgress?.jobId === progress.jobId) {
                  set({ importProgress: null });
                }
              }, 1500);
            }
          });
          set({ appInfo, paths, loading: false });
        } catch (error) {
          set({ loading: false, error: messageOf(error) });
        }
      },

      async reloadSettings() {
        set({ settings: await api.settings.get() });
      },

      async reloadDocuments() {
        set({ documents: await api.documents.list() });
      },

      async reloadConversations() {
        set({ conversations: await api.conversations.list() });
      },

      newConversation() {
        set({
          activeConversationId: null,
          messages: [],
          retrieval: null,
          streamingMessageId: null,
          error: null
        });
      },

      async loadConversation(conversationId) {
        try {
          const conversation = await api.conversations.get(conversationId);
          set({
            activeConversationId: conversation.id,
            messages: conversation.messages,
            retrieval: null,
            streamingMessageId: null,
            error: null
          });
        } catch (error) {
          set({ error: messageOf(error) });
        }
      },

      async deleteConversation(conversationId) {
        await api.conversations.delete(conversationId);
        set((state) => ({
          conversations: state.conversations.filter((item) => item.id !== conversationId),
          ...(state.activeConversationId === conversationId
            ? {
                activeConversationId: null,
                messages: [],
                retrieval: null,
                streamingMessageId: null
              }
            : {})
        }));
      },

      async sendQuestion(question, imageDataUrl) {
        const trimmed = question.trim();
        if (!trimmed) {
          return;
        }
        set({ error: null });
        try {
          const started = await api.chat.ask({
            conversationId: get().activeConversationId ?? undefined,
            question: trimmed,
            retrievalLimit: 12,
            ...(imageDataUrl ? { imageDataUrl } : {}),
            ...(get().selectedDocumentIds.length > 0
              ? { documentIds: get().selectedDocumentIds }
              : {})
          });
          set((state) => ({
            activeConversationId: started.conversationId,
            retrieval: started.retrieval,
            streamingMessageId: started.assistantMessageId,
            messages: mergeStreamingTurn(
              state.messages,
              started.userMessageId,
              started.assistantMessageId,
              started.conversationId,
              trimmed
            )
          }));
        } catch (error) {
          set({ error: messageOf(error) });
        }
      },

      applyChatEvent(event) {
        set((state) => {
          const messages = [...state.messages];
          let assistantIndex = messages.findIndex((message) => message.id === event.messageId);

          if (assistantIndex < 0) {
            messages.push({
              id: event.messageId,
              conversationId: event.conversationId,
              role: "assistant",
              content: "",
              status: "streaming",
              citations: [],
              createdAt: Date.now()
            });
            assistantIndex = messages.length - 1;
          }

          const current = messages[assistantIndex];
          if (!current) {
            return state;
          }

          const next: ChatMessage = { ...current };
          if (event.type === "delta") {
            next.content += event.delta ?? "";
          }
          if (event.type === "replace") {
            next.content = event.content ?? next.content;
          }
          if (event.type === "sources" || event.type === "complete") {
            next.citations = event.citations ?? [];
          }
          if (event.type === "complete") {
            next.status = "complete";
          }
          if (event.type === "error") {
            next.status = "error";
            next.content = next.content
              ? `${next.content}\n\n[回答中断：${event.error ?? "未知错误"}]`
              : `回答失败：${event.error ?? "未知错误"}`;
          }
          messages[assistantIndex] = next;

          return {
            messages,
            streamingMessageId: event.type === "complete" || event.type === "error" ? null : state.streamingMessageId
          };
        });

        if (event.type === "complete" && event.citations?.[0]) {
          const source = event.citations[0];
          void get().openDocument(
            source.documentId,
            source.pageNumber,
            source.excerpt,
            source.heading,
            source.printedPage
          );
        }
      },

      async importDialog() {
        set({ importing: true, error: null, notice: null, importProgress: null });
        try {
          const results = await api.documents.importDialog();
          const failed = results.filter((result) => result.status === "failed");
          const warnings = results
            .filter((result) => result.status === "imported" && result.warning)
            .map((result) => `${result.filename}: ${result.warning}`);
          await Promise.all([get().reloadDocuments(), get().reloadConversations()]);
          set({
            error:
              failed.length > 0
                ? failed.map((item) => `${item.filename}: ${item.error}`).join("\n")
                : null,
            notice: warnings.length > 0 ? warnings.join("\n") : null
          });
        } catch (error) {
          set({ error: messageOf(error) });
        } finally {
          set({ importing: false, importProgress: null });
        }
      },

      async changeDataLocation() {
        set({ movingData: true, error: null, notice: null });
        try {
          const choice = await api.knowledge.chooseLocation();
          if (!choice) {
            return;
          }
          const confirmed = window.confirm(
            `将现有资料库迁移到：\n${choice.targetDataRoot}\n\n` +
              "迁移会完整复制原件、索引、会话和设置；旧目录不会自动删除。完成应用将自动重启。"
          );
          if (!confirmed) {
            return;
          }
          const result = await api.knowledge.changeLocation(choice.parentDirectory);
          set({
            notice: `资料库已迁往 ${result.dataRoot}，应用正在重启。`
          });
        } catch (error) {
          set({ error: messageOf(error) });
        } finally {
          set({ movingData: false });
        }
      },

      async removeDocument(documentId) {
        try {
          await api.documents.remove(documentId);
          set((state) => ({
            documents: state.documents.filter((document) => document.id !== documentId),
            selectedDocumentIds: persistSelection(
              state.selectedDocumentIds.filter((id) => id !== documentId)
            ),
            reader: state.reader.documentId === documentId ? { ...EMPTY_READER } : state.reader
          }));
        } catch (error) {
          set({ error: messageOf(error) });
        }
      },

      async openDocument(documentId, pageNumber = 1, excerpt = null, heading = null, printedPage = null) {
        const document = get().documents.find((item) => item.id === documentId);
        set({
          reader: {
            documentId,
            documentTitle: document?.title ?? "原始资料",
            pageCount: document?.pageCount ?? 0,
            pageNumber,
            printedPage,
            heading,
            excerpt,
            toc: [],
            asset: null,
            loading: true,
            error: null
          }
        });

        try {
          const [toc, asset] = await Promise.all([
            api.documents.toc(documentId),
            api.documents.asset(documentId)
          ]);
          set((state) => ({
            reader: {
              ...state.reader,
              toc,
              asset,
              loading: false
            }
          }));
        } catch (error) {
          set((state) => ({
            reader: {
              ...state.reader,
              loading: false,
              error: messageOf(error)
            }
          }));
        }
      },

      setReaderPage(pageNumber) {
        set((state) => ({
          reader: {
            ...state.reader,
            pageNumber: Math.max(1, Math.round(pageNumber))
          }
        }));
      },

      closeReader() {
        set({ reader: { ...EMPTY_READER } });
      },

      setSettingsOpen(open) {
        set({ settingsOpen: open });
      },

      setLibraryOpen(open) {
        set({ libraryOpen: open });
      },

      toggleDocumentSelected(documentId) {
        set((state) => {
          const selected = state.selectedDocumentIds.includes(documentId)
            ? state.selectedDocumentIds.filter((id) => id !== documentId)
            : [...state.selectedDocumentIds, documentId];
          return { selectedDocumentIds: persistSelection(selected) };
        });
      },

      selectAllDocuments() {
        set((state) => ({
          selectedDocumentIds: persistSelection(
            state.documents.map((document) => document.id)
          )
        }));
      },

      clearDocumentSelection() {
        set({ selectedDocumentIds: persistSelection([]) });
      },

      dispose() {
        disposeChat();
        disposeImport();
      }
    };
  });
}

function mergeStreamingTurn(
  messages: ChatMessage[],
  userMessageId: string,
  assistantMessageId: string,
  conversationId: string,
  question: string
): ChatMessage[] {
  const next = messages.filter(
    (message) => message.id !== userMessageId && message.id !== assistantMessageId
  );
  const now = Date.now();
  next.push({
    id: userMessageId,
    conversationId,
    role: "user",
    content: question,
    status: "complete",
    citations: [],
    createdAt: now
  });
  next.push({
    id: assistantMessageId,
    conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
    citations: [],
    createdAt: now + 1
  });
  return next;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function persistSelection(ids: string[]): string[] {
  persistSelectedDocuments(ids);
  return ids;
}
