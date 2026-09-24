import { ChevronRight } from "lucide-react";
import type { TocNode } from "../../../../shared/types";

interface PdfOutlineProps {
  nodes: TocNode[];
  activePage: number;
  onSelect(pageNumber: number): void;
}

export function PdfOutline({
  nodes,
  activePage,
  onSelect
}: PdfOutlineProps): React.JSX.Element {
  if (nodes.length === 0) {
    return <p className="outline-empty">该文档没有可用目录。</p>;
  }

  return (
    <nav className="pdf-outline" aria-label="文档目录">
      {nodes.map((node) => (
        <button
          key={node.id}
          className={activePage === node.pageNumber ? "active" : ""}
          style={{ paddingLeft: `${8 + (node.level - 1) * 12}px` }}
          type="button"
          title={`${node.title} · 第 ${node.pageNumber} 页`}
          onClick={() => onSelect(node.pageNumber)}
        >
          <ChevronRight size={13} />
          <span>{node.title}</span>
          <small>{node.pageNumber}</small>
        </button>
      ))}
    </nav>
  );
}
