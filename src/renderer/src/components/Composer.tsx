import { useLayoutEffect, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  ImagePlus,
  LoaderCircle,
  ScanSearch,
  SendHorizontal,
  X
} from "lucide-react";
import type { ImageMatchResult } from "../../../shared/types";
import { clampComposerHeight } from "../lib/composer";
import { prepareImage } from "../lib/image-capture";
import { useAppStore } from "../store";

interface ComposerProps {
  disabled?: boolean;
  onSubmit(question: string, imageDataUrl?: string): void;
}

interface AttachedImage {
  filename: string;
  dataUrl: string;
  bytes: Uint8Array;
}

type MatchState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "done"; result: ImageMatchResult }
  | { status: "error"; message: string };

export function Composer({ disabled = false, onSubmit }: ComposerProps): React.JSX.Element {
  const [value, setValue] = useState("");
  const [attached, setAttached] = useState<AttachedImage | null>(null);
  const [match, setMatch] = useState<MatchState>({ status: "idle" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedDocumentIds = useAppStore((state) => state.selectedDocumentIds);
  const openDocument = useAppStore((state) => state.openDocument);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    const height = clampComposerHeight(element.scrollHeight);
    element.style.height = `${height}px`;
    element.style.overflowY = element.scrollHeight > height ? "auto" : "hidden";
  }, [value]);

  const attachImage = async (file: Blob, filename: string): Promise<void> => {
    setMatch({ status: "idle" });
    try {
      setAttached({ filename, ...(await prepareImage(file)) });
    } catch (error) {
      setMatch({
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Attaching never searches by itself; only this button does.
  const locate = async (): Promise<void> => {
    if (!attached) {
      return;
    }
    setMatch({ status: "busy" });
    try {
      const result = await window.stm32.images.match(
        attached.bytes,
        selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined
      );
      setMatch({ status: "done", result });
      const best = result.candidates[0];
      if (result.matched && best) {
        await openDocument(best.documentId, best.pageNumber);
      }
    } catch (error) {
      setMatch({
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const submit = (): void => {
    const question = value.trim();
    if (disabled || (!question && !attached)) {
      return;
    }
    onSubmit(question || "请识别并说明这张图片的内容。", attached?.dataUrl);
    setValue("");
    setAttached(null);
    setMatch({ status: "idle" });
  };

  return (
    <div className="composer">
      <div className="composer-tools">
        <button
          className={`locate-button ${attached ? "ready" : ""}`}
          type="button"
          disabled={!attached || match.status === "busy"}
          title={
            attached
              ? "在当前勾选的资料范围内查找这张截图对应的页面"
              : "请先用下面的图片按钮添加一张截图"
          }
          onClick={() => void locate()}
        >
          {match.status === "busy" ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <ScanSearch size={15} />
          )}
          查找对应页面
        </button>
        {attached && <span className="attach-hint">已附加：{attached.filename}</span>}
      </div>

      {attached && (
        <div className="attach-preview">
          <img src={attached.dataUrl} alt={attached.filename} />
          <button
            className="row-action"
            type="button"
            title="移除图片"
            onClick={() => {
              setAttached(null);
              setMatch({ status: "idle" });
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {match.status === "busy" && (
        <p className="attach-hint">正在识别截图并匹配手册页面...</p>
      )}
      {match.status === "error" && <p className="attach-hint">{match.message}</p>}

      {match.status === "done" && (
        <div className="image-match">
          <div className="image-match-head">
            {match.result.matched ? <CircleCheck size={15} /> : <CircleAlert size={15} />}
            <strong>图片来源定位</strong>
            <span className="image-match-file">最相似的一页已高亮</span>
          </div>
          {match.result.candidates.length === 0 && (
            <p>{match.result.warnings[0] ?? "没有找到匹配的页面。"}</p>
          )}
          {match.result.candidates.map((candidate, index) => (
            <button
              className={`image-match-item ${index === 0 ? "top" : ""}`}
              key={`${candidate.documentId}-${candidate.pageNumber}`}
              type="button"
              onClick={() => void openDocument(candidate.documentId, candidate.pageNumber)}
            >
              <span className="image-match-rank">
                <em>相似值</em>
                {Math.round(candidate.score * 100)}%
              </span>
              <span className="image-match-copy">
                <strong>
                  {index === 0 ? "最相似 · " : ""}
                  {candidate.documentTitle}
                </strong>
                <small>
                  第 {candidate.printedPage ?? candidate.pageNumber} 页
                  {candidate.heading ? ` · ${candidate.heading}` : ""}
                </small>
              </span>
            </button>
          ))}
          {match.result.warnings.map((warning) => (
            <p className="image-match-warning" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        aria-label="输入 STM32 问题"
        placeholder="询问寄存器、引脚、外设配置或电气参数..."
        rows={3}
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onPaste={(event) => {
          const image = Array.from(event.clipboardData.files).find((file) =>
            file.type.startsWith("image/")
          );
          if (image) {
            event.preventDefault();
            void attachImage(image, image.name || "剪贴板截图.png");
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="composer-footer">
        <span className="composer-hint">
          <button
            className="icon-button compact"
            type="button"
            title="添加图片（从文件资源管理器选择截图，或直接 Ctrl+V 粘贴）"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={16} />
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void attachImage(file, file.name || "截图.png");
              }
            }}
          />
          {attached
            ? "发送会连同图片一起提问 · 查页请点上方「查找对应页面」"
            : "Enter 发送 · Shift + Enter 换行"}
        </span>
        <button
          className="send-button"
          type="button"
          disabled={disabled || (!value.trim() && !attached)}
          onClick={submit}
          title="发送问题"
        >
          <SendHorizontal size={16} />
          发送
        </button>
      </div>
    </div>
  );
}
