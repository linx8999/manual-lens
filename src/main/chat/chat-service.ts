import type {
  ApiSettings,
  ChatEvent,
  ChatRequest,
  ChatStartResult,
  RetrievalBundle
} from "../../shared/types";
import type { QueryEmbedding } from "../search/retrieval-service";
import type { AppDatabase } from "../storage/database";
import { choosePreferredModel, extractSupportedModels } from "../api/model-utils";
import { parseCitations } from "./citation-parser";
import type { ConversationStore } from "./conversation-store";
import { buildAnswerPrompt } from "./prompt-builder";
import type { ChatMessageInput } from "../api/openai-client";
import { normalizeModelAnswer } from "./answer-normalizer";

interface Retriever {
  retrieve(
    question: string,
    limit?: number,
    documentIds?: string[]
  ): Promise<RetrievalBundle>;
}

export interface ChatRuntime {
  settings: ApiSettings;
  chatApiKey: string | null;
  embeddingApiKey: string | null;
  embedQuery?: (question: string) => Promise<QueryEmbedding | null>;
  updateChatModel?: (model: string) => Promise<void>;
}

interface ChatStreamClient {
  chatStream(request: {
    baseUrl: string;
    apiKey: string;
    model: string;
    messages: ChatMessageInput[];
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }): AsyncGenerator<string>;
}

interface ChatServiceOptions {
  database: AppDatabase;
  conversations: ConversationStore;
  retrieval: Retriever;
  runtimeProvider: () => Promise<ChatRuntime>;
  client?: ChatStreamClient;
}

export class ChatService {
  private readonly conversations: ConversationStore;
  private readonly retrieval: Retriever;
  private readonly runtimeProvider: () => Promise<ChatRuntime>;
  private readonly client?: ChatStreamClient;

  constructor(options: ChatServiceOptions) {
    this.conversations = options.conversations;
    this.retrieval = options.retrieval;
    this.runtimeProvider = options.runtimeProvider;
    this.client = options.client;
  }

  async ask(
    request: ChatRequest,
    emit: (event: ChatEvent) => void
  ): Promise<ChatStartResult> {
    const retrieval = await this.retrieval.retrieve(
      request.question,
      request.retrievalLimit,
      request.documentIds
    );
    const conversation = request.conversationId
      ? { id: request.conversationId }
      : this.conversations.create(request.question);
    const userMessage = this.conversations.addMessage(
      conversation.id,
      "user",
      request.question,
      "complete"
    );
    const assistantMessage = this.conversations.addMessage(
      conversation.id,
      "assistant",
      "",
      "streaming"
    );

    setTimeout(() => {
      void this.complete(
        conversation.id,
        assistantMessage.id,
        request.question,
        retrieval,
        request.imageDataUrl,
        emit
      );
    }, 0);

    return {
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      retrieval
    };
  }

  private async complete(
    conversationId: string,
    messageId: string,
    question: string,
    retrieval: RetrievalBundle,
    imageDataUrl: string | undefined,
    emit: (event: ChatEvent) => void
  ): Promise<void> {
    let answer = "";
    try {
      const runtime = await this.runtimeProvider();
      if (!runtime.chatApiKey || !this.client) {
        answer =
          "尚未配置聊天 API，因此现在只展示本地检索结果，不生成技术结论。" +
          (retrieval.warnings.length ? `\n\n${retrieval.warnings.join("\n")}` : "");
        emit({ conversationId, messageId, type: "delta", delta: answer });
      } else {
      const prompt = buildAnswerPrompt(question, retrieval.sources, retrieval.analysis);
        const messages: ChatMessageInput[] = [
          { role: "system", content: prompt.system },
          {
            role: "user",
            content: imageDataUrl
              ? [
                  { type: "text", text: prompt.user },
                  { type: "image_url", image_url: { url: imageDataUrl } }
                ]
              : prompt.user
          }
        ];
        const stream = async (model: string): Promise<void> => {
          for await (const delta of this.client!.chatStream({
            baseUrl: runtime.settings.chatBaseUrl,
            apiKey: runtime.chatApiKey!,
            model,
            messages,
            temperature: 0.15,
            timeoutMs: runtime.settings.requestTimeoutMs
          })) {
            answer += delta;
            emit({ conversationId, messageId, type: "delta", delta });
          }
        };

        try {
          await stream(runtime.settings.chatModel);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const advertised = extractSupportedModels(message);
          const fallback = choosePreferredModel(advertised, "chat");
          if (!fallback || fallback === runtime.settings.chatModel || answer) {
            throw error;
          }
          await runtime.updateChatModel?.(fallback);
          await stream(fallback);
        }
      }

      let citations = parseCitations(answer, retrieval.sources);
      if (citations.length === 0 && retrieval.sources.length > 0) {
        citations = retrieval.sources.slice(0, Math.min(4, retrieval.sources.length));
        const appended = `\n\n参考资料：${citations
          .map((source) => `[${source.sourceId}]`)
          .join(" ")}`;
        answer += appended;
        emit({ conversationId, messageId, type: "delta", delta: appended });
      }

      const normalizedAnswer = normalizeModelAnswer(answer);
      if (normalizedAnswer !== answer) {
        answer = normalizedAnswer;
        emit({
          conversationId,
          messageId,
          type: "replace",
          content: normalizedAnswer
        });
      }

      this.conversations.updateMessage(messageId, answer, "complete", citations);
      emit({ conversationId, messageId, type: "sources", citations });
      emit({ conversationId, messageId, type: "complete", citations });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const content = answer ? `${answer}\n\n[回答中断：${message}]` : `回答失败：${message}`;
      this.conversations.updateMessage(messageId, content, "error", []);
      emit({ conversationId, messageId, type: "error", error: message });
    }
  }
}
