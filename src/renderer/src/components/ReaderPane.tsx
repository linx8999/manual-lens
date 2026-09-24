import { useState } from "react";
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  ListTree,
  PanelRightClose
} from "lucide-react";
import { useAppStore } from "../store";
import { ImageReader } from "./reader/ImageReader";
import { PdfOutline } from "./reader/PdfOutline";
import { PdfPage } from "./reader/PdfPage";
import { WorkbookReader } from "./reader/WorkbookReader";

export function ReaderPane(): React.JSX.Element {
  const reader = useAppStore((state) => state.reader);
  const closeReader = useAppStore((state) => state.closeReader);
  const setReaderPage = useAppStore((state) => state.setReaderPage);
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [showHighlight, setShowHighlight] = useState(true);

  return (
    <aside className="reader-pane">
      <div className="reader-toolbar">
        <div>
          <strong>{reader.documentTitle || "原件阅读器"}</strong>
          <span>
            {reader.documentId
              ? `PDF ${reader.pageNumber}${reader.printedPage ? ` · 印刷页 ${reader.printedPage}` : ""}`
              : "尚未打开文档"}
          </span>
        </div>
        <div className="reader-actions">
          <button
            className={`icon-button ${showHighlight ? "active" : ""}`}
            type="button"
            title={showHighlight ? "隐藏引用高亮" : "显示引用高亮"}
            aria-label={showHighlight ? "隐藏引用高亮" : "显示引用高亮"}
            aria-pressed={showHighlight}
            disabled={!reader.documentId}
            onClick={() => setShowHighlight((value) => !value)}
          >
            <Highlighter size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            title={outlineVisible ? "隐藏目录" : "显示目录"}
            disabled={!reader.documentId || reader.toc.length === 0}
            onClick={() => setOutlineVisible((value) => !value)}
          >
            <ListTree size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="上一页"
            disabled={!reader.documentId || reader.pageNumber <= 1}
            onClick={() => setReaderPage(reader.pageNumber - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="下一页"
            disabled={!reader.documentId}
            onClick={() => setReaderPage(reader.pageNumber + 1)}
          >
            <ChevronRight size={17} />
          </button>
          {reader.documentId && (
            <button className="icon-button" type="button" title="关闭阅读器" onClick={closeReader}>
              <PanelRightClose size={17} />
            </button>
          )}
        </div>
      </div>

      {reader.documentId ? (
        <div className="reader-content">
          {outlineVisible && reader.toc.length > 0 && (
            <PdfOutline
              nodes={reader.toc}
              activePage={reader.pageNumber}
              onSelect={setReaderPage}
            />
          )}
          <div className="reader-document">
            {reader.loading && <p className="reader-status">正在读取原始资料...</p>}
            {reader.error && <p className="reader-error">{reader.error}</p>}
            {!reader.loading && !reader.error && (
              <div className="reader-page-caption">
                <strong>{reader.heading || "当前引用"}</strong>
                <span>
                  第 {reader.printedPage ?? reader.pageNumber} 页 / 共{" "}
                  {reader.pageCount || "..."} 页
                </span>
              </div>
            )}
            {!reader.loading && !reader.error && reader.asset?.kind === "pdf" && reader.asset.bytes && (
              <PdfPage
                bytes={reader.asset.bytes}
                pageNumber={reader.pageNumber}
                excerpt={reader.excerpt}
                showHighlight={showHighlight}
                onPageChange={setReaderPage}
                onPageCount={() => undefined}
              />
            )}
            {!reader.loading && !reader.error && reader.asset?.kind === "xlsx" && (
              <WorkbookReader
                sheets={reader.asset.sheets ?? []}
                pageNumber={reader.pageNumber}
                excerpt={reader.excerpt}
                showHighlight={showHighlight}
                onPageChange={setReaderPage}
              />
            )}
            {!reader.loading && !reader.error && reader.asset?.kind === "image" && reader.asset.bytes && (
              <ImageReader bytes={reader.asset.bytes} mimeType={reader.asset.mimeType} />
            )}
          </div>
        </div>
      ) : (
        <div className="reader-placeholder">
          <BookOpenText size={30} />
          <p>回答生成后，引用的原始页面会在这里自动打开。</p>
        </div>
      )}
    </aside>
  );
}
