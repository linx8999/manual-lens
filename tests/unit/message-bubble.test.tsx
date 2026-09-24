import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageBubble } from "../../src/renderer/src/components/MessageBubble";
import type { ChatMessage, Citation } from "../../src/shared/types";

const citation: Citation = {
  sourceId: "S1",
  documentId: "d1",
  documentTitle: "STM32F10xxx参考手册",
  chunkId: "c1",
  pageNumber: 120,
  printedPage: "120",
  heading: "USART复用功能重映射",
  excerpt: "USART1_REMAP",
  score: 1
};

const message: ChatMessage = {
  id: "m1",
  conversationId: "c1",
  role: "assistant",
  content: "## 结论\n\n**使用复用功能**，设置 `USART1_REMAP = 0`。[S1]",
  status: "complete",
  citations: [citation],
  createdAt: 1
};

describe("MessageBubble", () => {
  it("renders Markdown and makes inline citations clickable", () => {
    const onOpenCitation = vi.fn();
    render(<MessageBubble message={message} onOpenCitation={onOpenCitation} />);

    expect(screen.getByRole("heading", { name: "结论" })).toBeInTheDocument();
    expect(screen.getByText("使用复用功能").tagName).toBe("STRONG");
    expect(screen.getByText("USART1_REMAP = 0").tagName).toBe("CODE");

    fireEvent.click(screen.getByRole("button", { name: "[S1]" }));
    expect(onOpenCitation).toHaveBeenCalledWith(citation);
  });
});
