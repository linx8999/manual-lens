import { BookOpenText } from "lucide-react";
import type { Citation } from "../../../shared/types";

interface CitationCardProps {
  citation: Citation;
  onClick(citation: Citation): void;
}

export function CitationCard({ citation, onClick }: CitationCardProps): React.JSX.Element {
  return (
    <button className="citation-card" type="button" onClick={() => onClick(citation)}>
      <span className="citation-icon">
        <BookOpenText size={15} />
      </span>
      <span className="citation-copy">
        <strong>{citation.documentTitle}</strong>
        <span>
          PDF {citation.pageNumber}
          {citation.printedPage ? ` · 印刷页 ${citation.printedPage}` : ""}
          {citation.heading ? ` · ${citation.heading}` : ""}
        </span>
      </span>
      <span className="citation-tag">[{citation.sourceId}]</span>
    </button>
  );
}
