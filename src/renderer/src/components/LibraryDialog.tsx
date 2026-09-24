import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CircleAlert,
  CircleCheck,
  FileText,
  FolderOpen,
  LoaderCircle,
  Search,
  TableProperties,
  Trash2,
  Upload,
  X
} from "lucide-react";
import type { DocumentSummary } from "../../../shared/types";
import { useAppStore } from "../store";

export function LibraryDialog(): React.JSX.Element | null {
  const open = useAppStore((state) => state.libraryOpen);
  const setOpen = useAppStore((state) => state.setLibraryOpen);
  const paths = useAppStore((state) => state.paths);
  const documents = useAppStore((state) => state.documents);
  const importing = useAppStore((state) => state.importing);
  const movingData = useAppStore((state) => state.movingData);
  const progress = useAppStore((state) => state.importProgress);
  const importDialog = useAppStore((state) => state.importDialog);
  const changeDataLocation = useAppStore((state) => state.changeDataLocation);
  const removeDocument = useAppStore((state) => state.removeDocument);
  const selectedDocumentIds = useAppStore((state) => state.selectedDocumentIds);
  const toggleDocumentSelected = useAppStore((state) => state.toggleDocumentSelected);
  const selectAllDocuments = useAppStore((state) => state.selectAllDocuments);
  const clearDocumentSelection = useAppStore((state) => state.clearDocumentSelection);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds]);
  const visibleDocuments = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return documents;
    }
    return documents.filter((document) =>
      `${document.title} ${document.originalFilename}`.toLowerCase().includes(keyword)
    );
  }, [documents, query]);
  const allSelected = documents.length > 0 && selectedDocumentIds.length === documents.length;

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal library-modal" role="dialog" aria-modal="true" aria-label="知识库管理">
        <header className="modal-header">
          <div>
            <h2>知识库管理</h2>
            <p>原件、索引和会话保存在本地目录，可随时迁移。</p>
          </div>
          <button className="icon-button" type="button" onClick={() => setOpen(false)} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="library-toolbar">
          <span>
            {documents.length} 份资料 ·{" "}
            {documents.filter((document) => document.status === "ready").length} 份可检索
          </span>
          <div className="library-toolbar-actions">
            <label className="document-search">
              <Search size={14} />
              <input
                type="search"
                value={query}
                placeholder="搜索资料名称"
                aria-label="搜索资料名称"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              className="secondary-button compact"
              type="button"
              disabled={documents.length === 0}
              onClick={() => (allSelected ? clearDocumentSelection() : selectAllDocuments())}
            >
              {allSelected ? "取消全选" : "全选"}
            </button>
            <button
              className="primary-button compact"
              type="button"
              disabled={importing}
              onClick={() => void importDialog()}
            >
              {importing ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}
              导入文件
            </button>
          </div>
        </div>

        <div className="library-scope-bar">
          <span>
            {selectedDocumentIds.length === 0
              ? "未勾选任何资料，提问时将检索全部资料"
              : `已勾选 ${selectedDocumentIds.length}/${documents.length} 份，提问只检索这些资料`}
          </span>
        </div>

        <div className="library-location-panel">
          <span className="library-location-icon">
            <FolderOpen size={18} />
          </span>
          <div>
            <strong>资料库存放地址</strong>
            <span title={paths?.dataRoot}>{paths?.dataRoot ?? "正在读取位置..."}</span>
          </div>
          <button
            className="secondary-button compact"
            type="button"
            disabled={movingData || importing}
            onClick={() => void changeDataLocation()}
          >
            {movingData ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <ArrowRightLeft size={15} />
            )}
            设置存放位置
          </button>
        </div>

        {progress && (
          <div className="import-progress">
            <div>
              <strong>{progress.filename}</strong>
              <span>{progress.message}</span>
            </div>
            <progress value={progress.completed} max={Math.max(progress.total, 1)} />
          </div>
        )}

        <div className="document-list">
          {visibleDocuments.map((document) => (
            <div className="document-detail-row" key={document.id}>
              <input
                className="document-check"
                type="checkbox"
                checked={selected.has(document.id)}
                aria-label={`选择资料 ${document.title}`}
                title="勾选后提问只检索这些资料"
                onChange={() => toggleDocumentSelected(document.id)}
              />
              <span className="document-kind">
                {document.kind === "xlsx" ? <TableProperties size={17} /> : <FileText size={17} />}
              </span>
              <div>
                <strong>{document.title}</strong>
                <span>
                  {document.originalFilename} · {document.pageCount} 页 ·{" "}
                  {coverageLabel(document.indexCoverage)} · {statusLabel(document.status)}
                </span>
                {document.status === "error" && document.errorMessage && (
                  <span className="document-error">{document.errorMessage}</span>
                )}
              </div>
              <span className={`document-index-state ${document.status}`}>
                {document.status === "ready" ? (
                  <CircleCheck size={16} />
                ) : document.status === "error" ? (
                  <CircleAlert size={16} />
                ) : (
                  <LoaderCircle className="spin" size={16} />
                )}
              </span>
              <button
                className="danger-icon-button"
                type="button"
                title="删除资料"
                onClick={() => {
                  if (window.confirm(`删除“${document.title}”及其索引？`)) {
                    void removeDocument(document.id);
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {documents.length === 0 && <p className="empty-copy">尚未导入资料。</p>}
          {documents.length > 0 && visibleDocuments.length === 0 && (
            <p className="empty-copy">没有匹配「{query}」的资料。</p>
          )}
        </div>
      </section>
    </div>
  );
}

function statusLabel(status: DocumentSummary["status"]): string {
  if (status === "ready") return "处理完成";
  if (status === "indexing") return "正在建立索引";
  if (status === "error") return "处理失败";
  return "等待处理";
}

function coverageLabel(coverage: DocumentSummary["indexCoverage"]): string {
  if (coverage === "content") return "全文可检索";
  if (coverage === "metadata") return "仅按文件名检索";
  return "未提取到可检索文字";
}
