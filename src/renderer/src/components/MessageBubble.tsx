import { LoaderCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, Citation } from "../../../shared/types";
import { CitationCard } from "./CitationCard";

interface MessageBubbleProps {
  message: ChatMessage;
  onOpenCitation(citation: Citation): void;
}

export function MessageBubble({
  message,
  onOpenCitation
}: MessageBubbleProps): React.JSX.Element {
  const isAssistant = message.role === "assistant";
  const citationMap = new Map(message.citations.map((citation) => [citation.sourceId, citation]));
  const markdown = message.content.replace(
    /\[S(\d+)\]/g,
    (_match, sourceNumber: string) => `[S${sourceNumber}](#citation-S${sourceNumber})`
  );

  return (
    <article className={`message-row ${isAssistant ? "assistant" : "user"}`}>
      <div className="message-bubble">
        <div className="message-meta">
          <strong>{isAssistant ? "知识库智能体" : "你"}</strong>
          {message.status === "streaming" && (
            <span className="streaming-label">
              <LoaderCircle className="spin" size={13} />
              正在生成
            </span>
          )}
        </div>
        {isAssistant && message.content ? (
          <div className="message-content markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => {
                  if (href?.startsWith("#citation-")) {
                    const sourceId = href.slice("#citation-".length);
                    const citation = citationMap.get(sourceId);
                    return (
                      <button
                        className="inline-citation"
                        type="button"
                        aria-label={`[${sourceId}]`}
                        onClick={() => citation && onOpenCitation(citation)}
                      >
                        [{sourceId}]
                      </button>
                    );
                  }
                  return (
                    <a href={href} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  );
                }
              }}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="message-content message-plain">
            {message.content ||
              (message.status === "streaming" ? "正在检索手册并整理依据..." : "")}
          </div>
        )}
        {message.citations.length > 0 && (
          <div className="citation-list" aria-label="引用来源">
            {message.citations.map((citation) => (
              <CitationCard
                key={`${message.id}-${citation.sourceId}`}
                citation={citation}
                onClick={onOpenCitation}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
