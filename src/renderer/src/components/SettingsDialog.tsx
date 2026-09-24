import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle, RefreshCw, Save, X } from "lucide-react";
import type {
  ApiSettings,
  EmbeddingIndexStatus,
  EmbeddingProgress
} from "../../../shared/types";
import { normalizeTheme, THEMES } from "../../../shared/theme";
import { createSettingsForm, syncSettingsForm } from "../lib/settings-form";
import { useAppStore } from "../store";

interface SettingsDialogProps {
  settings: ApiSettings | null;
}

export function SettingsDialog({ settings }: SettingsDialogProps): React.JSX.Element | null {
  const open = useAppStore((state) => state.settingsOpen);
  const setOpen = useAppStore((state) => state.setSettingsOpen);
  const reloadSettings = useAppStore((state) => state.reloadSettings);
  const [form, setForm] = useState(() => createSettingsForm(settings));
  const [chatModels, setChatModels] = useState<string[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingModels, setLoadingModels] = useState<"chat" | "embedding" | null>(null);
  const [embeddingUnsupported, setEmbeddingUnsupported] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingIndexStatus | null>(null);
  const [embeddingProgress, setEmbeddingProgress] = useState<EmbeddingProgress | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!settings) {
      return;
    }
    setForm((current) => syncSettingsForm(current, settings));
  }, [settings]);

  useEffect(() => {
    if (!open || !settings || loadingModels) {
      return;
    }
    const timer = setTimeout(() => {
      if (settings.chatApiKeyConfigured) {
        void loadModels("chat", true);
      }
      if (settings.embeddingApiKeyConfigured) {
        void loadModels("embedding", true);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [open, settings]);

  useEffect(() => {
    const dispose = window.stm32.embeddings.onProgress((progress) => {
      setEmbeddingProgress(progress);
    });
    return dispose;
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void window.stm32.embeddings.status().then(setEmbeddingStatus).catch(() => undefined);
  }, [open, settings?.embeddingModel, settings?.embeddingApiKeyConfigured]);

  if (!open) {
    return null;
  }

  async function loadModels(
    kind: "chat" | "embedding",
    autoCorrect = false
  ): Promise<void> {
    setLoadingModels(kind);
    if (!autoCorrect) {
      setMessage("");
    }
    try {
      const baseUrl = kind === "chat" ? form.chatBaseUrl : form.embeddingBaseUrl;
      const apiKey = kind === "chat" ? form.chatApiKey : form.embeddingApiKey;
      const result = await window.stm32.settings.listModels({
        baseUrl,
        apiKey: apiKey || undefined,
        secretKind: kind,
        timeoutMs: form.requestTimeoutMs
      });
      const models = result.models;
      if (models.length === 0) {
        throw new Error("接口没有返回可用模型。");
      }
      if (kind === "chat") {
        setChatModels(models);
      } else {
        setEmbeddingModels(models);
      }

      const current = kind === "chat" ? form.chatModel : form.embeddingModel;
      const preferred = pickModel(models, kind);
      if (kind === "embedding" && !preferred) {
        setEmbeddingUnsupported(true);
        setMessage("接口没有返回 embedding 模型，向量检索将保持停用，关键词检索仍可使用。");
        return;
      }
      if (kind === "embedding") {
        setEmbeddingUnsupported(false);
      }
      const corrected = models.includes(current) ? current : preferred;
      if (corrected && corrected !== current) {
        setForm((value) => ({
          ...value,
          ...(kind === "chat" ? { chatModel: corrected } : { embeddingModel: corrected })
        }));
        setMessage(`已自动将无效模型“${current || "未填写"}”改为“${corrected}”。`);
        if (autoCorrect) {
          await window.stm32.settings.save({
            ...form,
            ...(kind === "chat" ? { chatModel: corrected } : { embeddingModel: corrected }),
            chatApiKey: form.chatApiKey || undefined,
            embeddingApiKey: form.embeddingApiKey || undefined
          });
          await reloadSettings();
        }
      } else if (!autoCorrect) {
        setMessage(`已获取 ${models.length} 个模型。`);
      }
    } catch (error) {
      if (!autoCorrect) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLoadingModels(null);
    }
  }

  const close = (): void => {
    document.documentElement.dataset.theme = normalizeTheme(settings?.theme);
    setOpen(false);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setMessage("");
    try {
      await window.stm32.settings.save(form);
      await reloadSettings();
      setMessage("设置已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const test = async (kind: "chat" | "embedding"): Promise<void> => {
    setBusy(true);
    setMessage("");
    try {
      await window.stm32.settings.save(form);
      await reloadSettings();
      const result =
        kind === "chat"
          ? await window.stm32.settings.testChat()
          : await window.stm32.settings.testEmbedding();
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const rebuildEmbeddings = async (): Promise<void> => {
    setIndexing(true);
    setEmbeddingProgress(null);
    setMessage("");
    try {
      await window.stm32.settings.save(form);
      await reloadSettings();
      const status = await window.stm32.embeddings.rebuild();
      setEmbeddingStatus(status);
      setMessage(`向量索引构建完成，共 ${status.indexed} 个文本块。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIndexing(false);
    }
  };

  const canBuildEmbeddings = Boolean(
    form.embeddingBaseUrl &&
      form.embeddingModel &&
      (form.embeddingApiKey || settings?.embeddingApiKeyConfigured) &&
      !embeddingUnsupported
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal settings-modal" role="dialog" aria-modal="true" aria-label="设置">
        <header className="modal-header">
          <div>
            <h2>设置</h2>
            <p>模型可以从接口自动获取，主题色保存在本地。</p>
          </div>
          <button className="icon-button" type="button" onClick={close} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="settings-grid">
          <fieldset>
            <legend>聊天模型</legend>
            <label>
              Base URL
              <input
                value={form.chatBaseUrl}
                onChange={(event) => setForm({ ...form, chatBaseUrl: event.target.value })}
              />
            </label>
            <label>
              模型名称
              <span className="field-with-action">
                <input
                  list="chat-model-options"
                  value={form.chatModel}
                  placeholder="打开设置后自动获取"
                  onChange={(event) => setForm({ ...form, chatModel: event.target.value })}
                />
                <button
                  className="secondary-button model-refresh"
                  type="button"
                  disabled={loadingModels !== null}
                  onClick={() => void loadModels("chat")}
                >
                  {loadingModels === "chat" ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                  获取
                </button>
              </span>
              <datalist id="chat-model-options">
                {chatModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>
            <label>
              API Key
              <input
                type="password"
                value={form.chatApiKey}
                placeholder={settings?.chatApiKeyConfigured ? "已保存，留空不修改" : "sk-..."}
                onChange={(event) => setForm({ ...form, chatApiKey: event.target.value })}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>向量模型</legend>
            <label>
              Base URL
              <input
                value={form.embeddingBaseUrl}
                onChange={(event) => {
                  setEmbeddingUnsupported(false);
                  setForm({ ...form, embeddingBaseUrl: event.target.value });
                }}
              />
            </label>
            <label>
              模型名称
              <span className="field-with-action">
                <input
                  list="embedding-model-options"
                  value={form.embeddingModel}
                  placeholder="优先选择 embedding 模型"
                  onChange={(event) => {
                    setEmbeddingUnsupported(false);
                    setForm({ ...form, embeddingModel: event.target.value });
                  }}
                />
                <button
                  className="secondary-button model-refresh"
                  type="button"
                  disabled={loadingModels !== null}
                  onClick={() => void loadModels("embedding")}
                >
                  {loadingModels === "embedding" ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                  获取
                </button>
              </span>
              <datalist id="embedding-model-options">
                {embeddingModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>
            <label>
              API Key
              <input
                type="password"
                value={form.embeddingApiKey}
                placeholder={
                  settings?.embeddingApiKeyConfigured ? "已保存，留空不修改" : "sk-..."
                }
                onChange={(event) =>
                  setForm({ ...form, embeddingApiKey: event.target.value })
                }
              />
            </label>
            <div className="embedding-index-panel">
              <div>
                <strong>向量索引</strong>
                <span>
                  {embeddingStatus
                    ? embeddingStatus.complete
                      ? `已建立 ${embeddingStatus.indexed} 个文本块`
                      : `当前 ${embeddingStatus.indexed} / ${embeddingStatus.total} 个文本块`
                    : "尚未检查索引状态"}
                </span>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={!canBuildEmbeddings || indexing}
                onClick={() => void rebuildEmbeddings()}
              >
                {indexing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
                重建向量索引
              </button>
            </div>
            {embeddingProgress && (
              <div className="embedding-progress">
                <span>{embeddingProgress.message}</span>
                <progress
                  value={embeddingProgress.completed}
                  max={Math.max(embeddingProgress.total, 1)}
                />
              </div>
            )}
          </fieldset>

          <fieldset className="image-engine-fieldset">
            <legend>图片识别引擎</legend>
            <p className="field-hint">
              输入框上传截图后，用哪种方式识别文字并定位手册页面。
            </p>
            <div className="engine-choice">
              <button
                className={`engine-option ${form.imageEngine === "vision" ? "active" : ""}`}
                type="button"
                onClick={() => setForm((value) => ({ ...value, imageEngine: "vision" }))}
              >
                <strong>视觉模型（推荐）</strong>
                <span>识别更准；截图会发送到你配置的聊天接口</span>
              </button>
              <button
                className={`engine-option ${form.imageEngine === "local" ? "active" : ""}`}
                type="button"
                onClick={() => setForm((value) => ({ ...value, imageEngine: "local" }))}
              >
                <strong>本机 OCR</strong>
                <span>完全离线，截图不出本机；识别率略低</span>
              </button>
            </div>
          </fieldset>

          <fieldset className="theme-fieldset">
            <legend>主题颜色</legend>
            <div className="theme-grid">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-swatch ${form.theme === theme.id ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    setForm((value) => ({ ...value, theme: theme.id }));
                    document.documentElement.dataset.theme = theme.id;
                  }}
                >
                  <span style={{ background: theme.color }} />
                  {theme.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="timeout-field">
            请求超时（毫秒）
            <input
              type="number"
              min={5000}
              step={1000}
              value={form.requestTimeoutMs}
              onChange={(event) =>
                setForm({ ...form, requestTimeoutMs: Number(event.target.value) })
              }
            />
          </label>
        </div>

        {message && <div className="dialog-message">{message}</div>}

        <footer className="modal-footer">
          <span className="security-note">
            <KeyRound size={14} />
            密钥使用 Windows DPAPI 加密
          </span>
          <div className="button-row">
            <button
              className="secondary-button"
              type="button"
              disabled={busy || embeddingUnsupported}
              title={embeddingUnsupported ? "当前地址未提供 embedding 模型" : undefined}
              onClick={() => void test("embedding")}
            >
              测试向量
            </button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void test("chat")}>
              测试聊天
            </button>
            <button className="primary-button compact" type="button" disabled={busy} onClick={() => void save()}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
              保存
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function pickModel(models: string[], purpose: "chat" | "embedding"): string | null {
  if (purpose === "embedding") {
    return models.find((model) => /embedding|embed/i.test(model)) ?? null;
  }
  return (
    models.find((model) => !/embedding|embed|whisper|tts|image|moderation/i.test(model)) ??
    models[0] ??
    null
  );
}
