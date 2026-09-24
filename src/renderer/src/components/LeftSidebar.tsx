import { useMemo, useState } from "react";
import {
  Database,
  FileImage,
  FileText,
  MessageSquareText,
  Plus,
  Search,
  TableProperties,
  Trash2
} from "lucide-react";
import type { DocumentKind } from "../../../shared/types";
import { useAppStore } from "../store";

export function LeftSidebar(): React.JSX.Element {
  const conversations = useAppStore((state) => state.conversations);
  const documents = useAppStore((state) => state.documents);
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const paths = useAppStore((state) => state.paths);
  const newConversation = useAppStore((state) => state.newConversation);
  const loadConversation = useAppStore((state) => state.loadConversation);
  const deleteConversation = useAppStore((state) => state.deleteConversation);
  const openDocument = useAppStore((state) => state.openDocument);
  const setLibraryOpen = useAppStore((state) => state.setLibraryOpen);
  const selectedDocumentIds = useAppStore((state) => state.selectedDocumentIds);
  const toggleDocumentSelected = useAppStore((state) => state.toggleDocumentSelected);
  const selectAllDocuments = useAppStore((state) => state.selectAllDocuments);
  const clearDocumentSelection = useAppStore((state) => state.clearDocumentSelection);
  const [documentQuery, setDocumentQuery] = useState("");

  const selected = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds]);
  const visibleDocuments = useMemo(() => {
    const keyword = documentQuery.trim().toLowerCase();
    if (!keyword) {
      return documents;
    }
    return documents.filter((document) =>
      `${document.title} ${document.originalFilename}`.toLowerCase().includes(keyword)
    );
  }, [documents, documentQuery]);
  const allSelected = documents.length > 0 && selectedDocumentIds.length === documents.length;

  return (
    <aside className="sidebar">
      <button className="primary-button" type="button" onClick={newConversation}>
        <Plus size={16} />
        新对话
      </button>

      <section className="sidebar-section conversation-section">
        <div className="section-heading">
          <span>会话</span>
          <span>{conversations.length}</span>
        </div>
        <div className="list-stack">
          {conversations.length === 0 && <p className="empty-copy">暂无历史会话</p>}
          {conversations.map((conversation) => (
            <div
              className={`list-row ${activeConversationId === conversation.id ? "active" : ""}`}
              key={conversation.id}
            >
              <button
                className="list-main"
                type="button"
                onClick={() => void loadConversation(conversation.id)}
              >
                <MessageSquareText size={15} />
                <span>{conversation.title}</span>
              </button>
              <button
                className="row-action"
                type="button"
                title="删除会话"
                onClick={() => void deleteConversation(conversation.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="sidebar-section documents-section">
        <div className="section-heading">
          <span>资料库</span>
          <button type="button" onClick={() => setLibraryOpen(true)}>
            管理
          </button>
        </div>
        <label className="document-search">
          <Search size={14} />
          <input
            type="search"
            value={documentQuery}
            placeholder="搜索资料"
            aria-label="搜索资料"
            onChange={(event) => setDocumentQuery(event.target.value)}
          />
        </label>
        <div className="document-scope-bar">
          <span>
            {selectedDocumentIds.length === 0
              ? "检索全部资料"
              : `已选 ${selectedDocumentIds.length}/${documents.length}`}
          </span>
          <button
            type="button"
            disabled={documents.length === 0}
            onClick={() => (allSelected ? clearDocumentSelection() : selectAllDocuments())}
          >
            {allSelected ? "取消全选" : "全选"}
          </button>
        </div>
        <div className="list-stack">
          {documents.length === 0 && <p className="empty-copy">尚未导入手册</p>}
          {documents.length > 0 && visibleDocuments.length === 0 && (
            <p className="empty-copy">没有匹配「{documentQuery}」的资料</p>
          )}
          {visibleDocuments.map((document) => {
            const isSelected = selected.has(document.id);
            return (
              <div
                className={`document-row ${isSelected ? "selected" : ""}`}
                key={document.id}
              >
                <input
                  className="document-check"
                  type="checkbox"
                  checked={isSelected}
                  title={isSelected ? "从检索范围移除" : "加入检索范围"}
                  aria-label={`选择资料 ${document.title}`}
                  onChange={() => toggleDocumentSelected(document.id)}
                />
                <button
                  className="document-open"
                  type="button"
                  title={document.originalFilename}
                  onClick={() => void openDocument(document.id, 1)}
                >
                  <DocumentIcon kind={document.kind} />
                  <span>
                    <strong>{document.title}</strong>
                    <small>
                      {document.kind === "pdf"
                        ? `${document.pageCount} 页`
                        : documentKindLabel(document.kind)}
                    </small>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="sidebar-footer" title={paths?.dataRoot}>
        <Database size={14} />
        <span>{paths?.dataRoot ?? "正在读取资料库位置..."}</span>
      </footer>
    </aside>
  );
}

function DocumentIcon({ kind }: { kind: DocumentKind }): React.JSX.Element {
  if (kind === "xlsx") return <TableProperties size={16} />;
  if (kind === "image") return <FileImage size={16} />;
  return <FileText size={16} />;
}

function documentKindLabel(kind: DocumentKind): string {
  if (kind === "xlsx") return "表格";
  if (kind === "image") return "图片";
  return "PDF";
}
