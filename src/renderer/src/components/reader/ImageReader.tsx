import { useEffect, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

interface ImageReaderProps {
  bytes: Uint8Array;
  mimeType?: string;
}

export function ImageReader({ bytes, mimeType }: ImageReaderProps): React.JSX.Element {
  const [url, setUrl] = useState("");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const blob = new Blob([bytes.slice().buffer], {
      type: mimeType || "application/octet-stream"
    });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes, mimeType]);

  return (
    <div className="image-reader">
      <div className="pdf-controls">
        <button
          className="icon-button"
          type="button"
          title="缩小"
          onClick={() => setZoom((value) => Math.max(0.4, value - 0.1))}
        >
          <Minus size={16} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          className="icon-button"
          type="button"
          title="放大"
          onClick={() => setZoom((value) => Math.min(3, value + 0.1))}
        >
          <Plus size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="原始大小"
          onClick={() => setZoom(1)}
        >
          <Maximize2 size={16} />
        </button>
      </div>
      <div className="image-stage">
        {url && <img src={url} style={{ width: `${zoom * 100}%` }} alt="原始资料" />}
      </div>
    </div>
  );
}
