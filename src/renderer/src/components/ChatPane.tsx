import { AlertCircle, BookOpenText } from "lucide-react";
import type { Citation } from "../../../shared/types";
import { useAppStore } from "../store";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";

const SUGGESTIONS = [
  "PA9 怎么配置成 USART1_TX？",
  "GPIOA 的 MODE 位如何设置？",
  "STM32F103C8T6 有多少个定时器？",
  "ADC 采样时间应该怎样选择？"
];

export function ChatPane(): React.JSX.Element {
  const messages = useAppStore((state) => state.messages);
  const retrieval = useAppStore((state) => state.retrieval);
  const streamingMessageId = useAppStore((state) => state.streamingMessageId);
  const error = useAppStore((state) => state.error);
  const notice = useAppStore((state) => state.notice);
  const sendQuestion = useAppStore((state) => state.sendQuestion);
  const openDocument = useAppStore((state) => state.openDocument);

  const openCitation = (citation: Citation): void => {
    void openDocument(
      citation.documentId,
      citation.pageNumber,
      citation.excerpt,
      citation.heading,
      citation.printedPage
    );
  };

  return (
    <section className="chat-pane">
      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              <BookOpenText size={24} />
            </span>
            <h1>从手册原件得到答案</h1>
            <p>检索本地 STM32 手册，回答中的引用可直接打开对应页面。</p>
            <div className="prompt-examples">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendQuestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onOpenCitation={openCitation}
              />
            ))}
          </div>
        )}
      </div>

      {retrieval && retrieval.warnings.length > 0 && (
        <div className="retrieval-note">
          <AlertCircle size={14} />
          <span>{retrieval.warnings[0]}</span>
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}
      <Composer
        disabled={Boolean(streamingMessageId)}
        onSubmit={(question, imageDataUrl) => void sendQuestion(question, imageDataUrl)}
      />
    </section>
  );
}
