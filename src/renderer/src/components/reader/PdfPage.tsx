import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask
} from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Maximize2, Minus, Plus, RotateCw } from "lucide-react";
import {
  normalizeExcerpt,
  pageScrollTop,
  rescaleScrollTop,
  resolvePageNumber,
  textMatchesExcerpt
} from "../../lib/pdf";
import { readerDragScale } from "../../lib/layout";

GlobalWorkerOptions.workerSrc = workerSrc;

const PAGE_GAP = 16;
const RENDER_MARGIN = 900;

interface PdfPageProps {
  bytes: Uint8Array;
  pageNumber: number;
  excerpt: string | null;
  showHighlight: boolean;
  onPageChange(pageNumber: number): void;
  onPageCount(pageCount: number): void;
}

export function PdfPage({
  bytes,
  pageNumber,
  excerpt,
  showHighlight,
  onPageChange,
  onPageCount
}: PdfPageProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const onPageChangeRef = useRef(onPageChange);
  const onPageCountRef = useRef(onPageCount);
  const resizingRef = useRef(false);
  const containerWidthRef = useRef(0);
  const pendingContainerWidthRef = useRef(0);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageAspectRatio, setPageAspectRatio] = useState(1.414);
  const [containerWidth, setContainerWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([pageNumber]));
  const [error, setError] = useState("");

  onPageChangeRef.current = onPageChange;
  onPageCountRef.current = onPageCount;

  const pageWidth = Math.max(320, containerWidth - 32) * zoom;
  const orientedAspectRatio =
    rotation % 180 === 0 ? pageAspectRatio : 1 / pageAspectRatio;
  const pageHeight = pageWidth * orientedAspectRatio;
  const slotHeight = pageHeight + PAGE_GAP;
  const geometryRef = useRef({ pageHeight, slotHeight });
  const previousSlotHeightRef = useRef(slotHeight);
  const lastScrollTopRef = useRef(0);
  const reportedPageRef = useRef<number | null>(null);
  geometryRef.current = { pageHeight, slotHeight };

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const width = entry.contentRect.width;
      if (resizingRef.current) {
        // Dragging: keep the existing raster, preview the new size with a
        // compositor-only transform, and commit the width once on release.
        pendingContainerWidthRef.current = width;
        const stack = stackRef.current;
        if (stack) {
          stack.style.transformOrigin = "top center";
          stack.style.transform = `scale(${readerDragScale(containerWidthRef.current, width)})`;
        }
        return;
      }
      setContainerWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  containerWidthRef.current = containerWidth;

  useEffect(() => {
    const handleStart = (): void => {
      resizingRef.current = true;
      pendingContainerWidthRef.current = containerWidthRef.current;
    };
    const handleEnd = (): void => {
      if (!resizingRef.current) {
        return;
      }
      resizingRef.current = false;
      const stack = stackRef.current;
      if (stack) {
        stack.style.transform = "";
        stack.style.transformOrigin = "";
      }
      const nextWidth = pendingContainerWidthRef.current;
      if (nextWidth > 0) {
        setContainerWidth(nextWidth);
      }
    };
    window.addEventListener("reader-resize-start", handleStart);
    window.addEventListener("reader-resize-end", handleEnd);
    return () => {
      window.removeEventListener("reader-resize-start", handleStart);
      window.removeEventListener("reader-resize-end", handleEnd);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const loadingTask = getDocument({ data: bytes.slice().buffer });
    void loadingTask.promise
      .then(async (document) => {
        if (disposed) {
          return;
        }
        const firstPage = await document.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        setPageAspectRatio(viewport.height / viewport.width);
        setPdf(document);
        onPageCountRef.current(document.numPages);
        setVisiblePages(
          new Set(
            [pageNumber - 1, pageNumber, pageNumber + 1].filter(
              (value) => value >= 1 && value <= document.numPages
            )
          )
        );
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason))
      );

    return () => {
      disposed = true;
      void loadingTask.destroy();
      setPdf(null);
    };
  }, [bytes]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !pdf || pageHeight <= 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const visiblePage = Number(
              (entry.target as HTMLElement).dataset.pageNumber
            );
            if (!Number.isFinite(visiblePage)) {
              continue;
            }
            if (entry.isIntersecting) {
              next.add(visiblePage);
            } else {
              next.delete(visiblePage);
            }
          }
          return next;
        });

        const rootRect = root.getBoundingClientRect();
        const visibleEntries = entries
          .filter(
            (entry) =>
              entry.isIntersecting &&
              entry.boundingClientRect.bottom > rootRect.top &&
              entry.boundingClientRect.top < rootRect.bottom
          )
          .sort(
            (left, right) =>
              Math.abs(left.boundingClientRect.top - rootRect.top) -
              Math.abs(right.boundingClientRect.top - rootRect.top)
          );
        const visibleEntry = visibleEntries[0];
        const visiblePage = visibleEntry
          ? Number((visibleEntry.target as HTMLElement).dataset.pageNumber)
          : NaN;
        if (Number.isFinite(visiblePage) && visiblePage !== pageNumber) {
          reportedPageRef.current = visiblePage;
          onPageChangeRef.current(visiblePage);
        }
      },
      {
        root,
        rootMargin: `${RENDER_MARGIN}px 0px`,
        threshold: 0
      }
    );

    root
      .querySelectorAll<HTMLElement>("[data-page-number]")
      .forEach((slot) => observer.observe(slot));
    return () => observer.disconnect();
  }, [pdf, pageHeight, slotHeight]);

  // Track the live scroll offset so a width change can restore it.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const record = (): void => {
      lastScrollTopRef.current = element.scrollTop;
    };
    record();
    element.addEventListener("scroll", record, { passive: true });
    return () => element.removeEventListener("scroll", record);
  }, []);

  // Resizing the pane rescales every page slot; scale the offset with them
  // instead of letting the viewport drift to a different page.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const previousSlotHeight = previousSlotHeightRef.current;
    previousSlotHeightRef.current = slotHeight;
    if (!element || previousSlotHeight <= 0 || previousSlotHeight === slotHeight) {
      return;
    }
    const nextScrollTop = rescaleScrollTop(
      lastScrollTopRef.current,
      previousSlotHeight,
      slotHeight
    );
    element.scrollTop = nextScrollTop;
    lastScrollTopRef.current = nextScrollTop;
  }, [slotHeight]);

  // Only jump when navigation asked for a different page; page changes that the
  // reader reported itself already match the current scroll position.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !pdf) {
      return;
    }
    if (reportedPageRef.current === pageNumber) {
      reportedPageRef.current = null;
      return;
    }
    const { pageHeight: height, slotHeight: slot } = geometryRef.current;
    if (slot <= 0) {
      return;
    }
    const targetSlot = element.querySelector<HTMLElement>(
      `[data-page-number="${pageNumber}"]`
    );
    const target = targetSlot
      ? element.scrollTop +
        targetSlot.getBoundingClientRect().top -
        element.getBoundingClientRect().top
      : pageScrollTop(pageNumber, height, PAGE_GAP);
    element.scrollTo({ top: target, behavior: "auto" });
    lastScrollTopRef.current = target;
  }, [pdf, pageNumber]);

  return (
    <div className="pdf-reader">
      <div className="pdf-controls">
        <button
          className="icon-button"
          type="button"
          title="缩小"
          onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))}
        >
          <Minus size={16} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          className="icon-button"
          type="button"
          title="放大"
          onClick={() => setZoom((value) => Math.min(2.4, value + 0.1))}
        >
          <Plus size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="适合宽度"
          onClick={() => setZoom(1)}
        >
          <Maximize2 size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="旋转"
          onClick={() => setRotation((value) => (value + 90) % 360)}
        >
          <RotateCw size={16} />
        </button>
        <label className="page-input">
          页
          <input
            type="number"
            min={1}
            max={pdf?.numPages ?? 1}
            value={pageNumber}
            onChange={(event) =>
              onPageChangeRef.current(
                resolvePageNumber(
                  Number(event.target.value),
                  pdf?.numPages ?? 1
                )
              )
            }
          />
          / {pdf?.numPages ?? "..."}
        </label>
      </div>

      {error && <div className="reader-error">{error}</div>}
      <div
        className="pdf-continuous-scroll"
        ref={scrollRef}
      >
        {pdf && (
          <div className="pdf-page-stack" ref={stackRef}>
            {Array.from({ length: pdf.numPages }, (_, index) => {
              const currentPage = index + 1;
              return (
                <div
                  className="pdf-page-slot"
                  data-page-number={currentPage}
                  key={currentPage}
                  style={{ height: `${pageHeight}px` }}
                >
                  {visiblePages.has(currentPage) ? (
                    <PdfCanvasPage
                      pdf={pdf}
                      pageNumber={currentPage}
                      width={pageWidth}
                      rotation={rotation}
                      excerpt={currentPage === pageNumber ? excerpt : null}
                      showHighlight={showHighlight}
                    />
                  ) : (
                    <div className="pdf-page-placeholder">
                      第 {currentPage} 页
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface PdfCanvasPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  rotation: number;
  excerpt: string | null;
  showHighlight: boolean;
}

function PdfCanvasPage({
  pdf,
  pageNumber,
  width,
  rotation,
  excerpt,
  showHighlight
}: PdfCanvasPageProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const render = async (): Promise<void> => {
      const canvas = canvasRef.current;
      const textContainer = textLayerRef.current;
      if (!canvas || !textContainer) {
        return;
      }

      try {
        setError("");
        const page = await pdf.getPage(pageNumber);
        const unitViewport = page.getViewport({ scale: 1, rotation });
        const scale = width / unitViewport.width;
        const viewport = page.getViewport({ scale, rotation });
        const pixelRatio = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTaskRef.current?.cancel();
        const renderTask = page.render({
          canvas,
          viewport,
          transform:
            pixelRatio === 1
              ? undefined
              : [pixelRatio, 0, 0, pixelRatio, 0, 0]
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (cancelled) {
          return;
        }

        textContainer.replaceChildren();
        textContainer.style.width = `${Math.floor(viewport.width)}px`;
        textContainer.style.height = `${Math.floor(viewport.height)}px`;
        const textLayer = new TextLayer({
          textContentSource: await page.streamTextContent(),
          container: textContainer,
          viewport
        });
        await textLayer.render();

        const normalizedExcerpt = normalizeExcerpt(excerpt);
        if (showHighlight && normalizedExcerpt) {
          for (const div of textLayer.textDivs) {
            if (textMatchesExcerpt(div.textContent ?? "", normalizedExcerpt)) {
              div.classList.add("citation-hit");
            }
          }
        }
      } catch (reason) {
        if (
          !cancelled &&
          (reason as { name?: string }).name !==
            "RenderingCancelledException"
        ) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdf, pageNumber, width, rotation, excerpt, showHighlight]);

  return (
    <div className="pdf-page-surface">
      {error && <div className="reader-error">{error}</div>}
      <canvas ref={canvasRef} />
      <div className="textLayer" ref={textLayerRef} />
    </div>
  );
}
