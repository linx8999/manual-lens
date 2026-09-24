import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import { Database, GripVertical, Settings, Wifi, WifiOff } from "lucide-react";
import { APP_NAME } from "../../../shared/constants";
import { normalizeTheme } from "../../../shared/theme";
import { clampReaderWidth } from "../lib/layout";
import { useAppStore } from "../store";
import { ChatPane } from "./ChatPane";
import { LeftSidebar } from "./LeftSidebar";
import { LibraryDialog } from "./LibraryDialog";
import { ReaderPane } from "./ReaderPane";
import { SettingsDialog } from "./SettingsDialog";

export function AppShell(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setLibraryOpen = useAppStore((state) => state.setLibraryOpen);
  const configured = Boolean(settings?.chatApiKeyConfigured);
  const importProgress = useAppStore((state) => state.importProgress);
  const [readerWidth, setReaderWidth] = useState(() => {
    const stored = Number(localStorage.getItem("readerWidth"));
    return clampReaderWidth(Number.isFinite(stored) && stored > 0 ? stored : 560, window.innerWidth);
  });
  const workspaceRef = useRef<HTMLDivElement>(null);
  const readerWidthRef = useRef(readerWidth);
  const draggingRef = useRef(false);
  const draggingWidthRef = useRef(readerWidth);
  readerWidthRef.current = readerWidth;

  // Dragging paints `--reader-width` straight onto the workspace so React never
  // re-renders the panes (and the PDF never re-rasterises) while the pointer
  // moves. Re-apply it after any unrelated re-render so the pane cannot snap
  // back to the committed width mid-drag.
  useLayoutEffect(() => {
    if (!draggingRef.current) {
      return;
    }
    workspaceRef.current?.style.setProperty("--reader-width", `${draggingWidthRef.current}px`);
  });

  useEffect(() => {
    document.documentElement.dataset.theme = normalizeTheme(settings?.theme);
  }, [settings?.theme]);

  useEffect(() => {
    const handleResize = (): void => {
      setReaderWidth((value) => clampReaderWidth(value, window.innerWidth));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem("readerWidth", String(readerWidth));
  }, [readerWidth]);

  const resizeReader = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = readerWidthRef.current;
    let latestWidth = startWidth;
    let frame = 0;
    draggingRef.current = true;
    draggingWidthRef.current = startWidth;
    document.body.classList.add("resizing-reader");
    window.dispatchEvent(new Event("reader-resize-start"));

    const paint = (): void => {
      frame = 0;
      workspaceRef.current?.style.setProperty("--reader-width", `${latestWidth}px`);
    };
    const move = (moveEvent: PointerEvent): void => {
      latestWidth = clampReaderWidth(
        startWidth + (startX - moveEvent.clientX),
        window.innerWidth
      );
      draggingWidthRef.current = latestWidth;
      if (!frame) {
        frame = window.requestAnimationFrame(paint);
      }
    };
    const stop = (): void => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      document.body.classList.remove("resizing-reader");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      draggingRef.current = false;
      // Commit once: this is the only React render of the whole drag.
      setReaderWidth(latestWidth);
      window.dispatchEvent(new Event("reader-resize-end"));
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <strong>{APP_NAME}</strong>
        </div>
        <div className="header-actions">
          {importProgress && (
            <span className="status-pill" title={importProgress.message}>
              <Database size={14} />
              入库 {importProgress.completed}/{importProgress.total}
            </span>
          )}
          <span className={`status-pill ${configured ? "ready" : ""}`}>
            {configured ? <Wifi size={14} /> : <WifiOff size={14} />}
            {configured ? "API 已配置" : "API 未配置"}
          </span>
          <button
            className="icon-button"
            type="button"
            title="知识库管理"
            onClick={() => setLibraryOpen(true)}
          >
            <Database size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="API 设置"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={17} />
          </button>
        </div>
      </header>

      <div
        className="workspace"
        ref={workspaceRef}
        style={{ "--reader-width": `${readerWidth}px` } as CSSProperties}
      >
        <LeftSidebar />
        <ChatPane />
        <div
          className="reader-splitter"
          role="separator"
          aria-label="调整原件阅读器宽度"
          aria-orientation="vertical"
          aria-valuenow={readerWidth}
          tabIndex={0}
          title="拖动调整阅读器宽度，双击复位"
          onPointerDown={resizeReader}
          onDoubleClick={() =>
            setReaderWidth(clampReaderWidth(560, window.innerWidth))
          }
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setReaderWidth((value) =>
                clampReaderWidth(value + 32, window.innerWidth)
              );
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setReaderWidth((value) =>
                clampReaderWidth(value - 32, window.innerWidth)
              );
            }
          }}
        >
          <GripVertical size={15} />
        </div>
        <ReaderPane />
      </div>

      <SettingsDialog settings={settings} />
      <LibraryDialog />
    </main>
  );
}
