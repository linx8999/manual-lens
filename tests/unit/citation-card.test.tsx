import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CitationCard } from "../../src/renderer/src/components/CitationCard";
import type { Citation } from "../../src/shared/types";

const citation: Citation = {
  sourceId: "S1",
  documentId: "d1",
  documentTitle: "STM32F10xxx参考手册",
  chunkId: "c1",
  pageNumber: 172,
  printedPage: "159",
  heading: "GPIO 功能描述",
  excerpt: "PA9 可以用作 USART1_TX。",
  score: 1
};

describe("CitationCard", () => {
  it("shows the manual page and opens it when clicked", () => {
    const onClick = vi.fn();
    render(<CitationCard citation={citation} onClick={onClick} />);

    expect(screen.getByText("STM32F10xxx参考手册")).toBeInTheDocument();
    expect(screen.getByText(/PDF 172/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledWith(citation);
  });
});
