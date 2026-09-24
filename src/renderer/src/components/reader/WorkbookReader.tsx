import { useMemo } from "react";
import type { WorkbookSheet } from "../../../../shared/types";
import { normalizeExcerpt, textMatchesExcerpt } from "../../lib/pdf";

interface WorkbookReaderProps {
  sheets: WorkbookSheet[];
  pageNumber: number;
  excerpt: string | null;
  showHighlight: boolean;
  onPageChange(pageNumber: number): void;
}

export function WorkbookReader({
  sheets,
  pageNumber,
  excerpt,
  showHighlight,
  onPageChange
}: WorkbookReaderProps): React.JSX.Element {
  const activeIndex = Math.min(Math.max(0, pageNumber - 1), Math.max(0, sheets.length - 1));
  const sheet = sheets[activeIndex];
  const normalizedExcerpt = useMemo(() => normalizeExcerpt(excerpt), [excerpt]);

  return (
    <div className="workbook-reader">
      <div className="sheet-tabs">
        {sheets.map((item, index) => (
          <button
            key={`${item.name}-${index}`}
            className={index === activeIndex ? "active" : ""}
            type="button"
            onClick={() => onPageChange(index + 1)}
          >
            {item.name}
          </button>
        ))}
      </div>
      {sheet ? (
        <div className="workbook-scroll">
          <table>
            <tbody>
              {sheet.rows.map((row, rowIndex) => {
                const rowText = row.map((cell) => String(cell ?? "")).join(" ");
                return (
                  <tr
                    key={rowIndex}
                    className={
                      showHighlight &&
                      normalizedExcerpt &&
                      textMatchesExcerpt(rowText, normalizedExcerpt)
                        ? "citation-hit-row"
                        : ""
                    }
                  >
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell === null ? "" : String(cell)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="outline-empty">工作表没有可显示的内容。</p>
      )}
    </div>
  );
}
