# STM32 RAG Desktop Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a Windows desktop STM32 knowledge agent with page-anchored hybrid retrieval, OpenAI-compatible API configuration, and an integrated original-document reader.

**Architecture:** Electron owns the filesystem, SQLite database, ingestion, retrieval, API calls, and secure secret storage. A restricted preload bridge exposes typed operations to a React renderer. The renderer provides a three-pane chat, library, and PDF/Excel/image reader workspace.

**Tech Stack:** Electron, Electron Vite, React, TypeScript, Vite, Vitest, Testing Library, Node.js built-in SQLite with FTS5, PDF.js, SheetJS, Electron Builder, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-stm32-rag-desktop-agent-design.md`

## Global Constraints

- Application is local-first and must not open an external browser for normal use.
- Default knowledge data root is `D:\STM32RAG智能体\data`.
- Main process is the only code that reads arbitrary files or writes the database.
- Renderer has `contextIsolation: true` and `nodeIntegration: false`.
- API keys are encrypted with Electron `safeStorage`; they never enter renderer logs.
- All model endpoints are OpenAI-compatible and independently configurable.
- Text chunks never cross a page boundary.
- A citation always includes document id, physical page, chunk id, and excerpt.
- The two identical STM32F103x8B PDFs must produce one document record.
- Tests must use real parser and database behavior; network calls are replaced only at the HTTP boundary.

---

### Task 1: Project foundation and test runner

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vitest.config.ts`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `pnpm dev`, `pnpm build`, and `pnpm test` commands; Electron main entry `src/main/index.ts`; renderer entry `src/renderer/src/main.tsx`.

- [ ] **Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from "vitest";
import { APP_NAME } from "../../src/shared/constants";

describe("application identity", () => {
  it("uses the product name", () => {
    expect(APP_NAME).toBe("STM32 手册智能体");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/unit/smoke.test.ts`

Expected: fail because the project files and `APP_NAME` do not exist.

- [ ] **Step 3: Create the Electron/Vite/React skeleton**

The main process creates a `BrowserWindow`, loads the renderer, and exposes no raw Node.js objects. The renderer displays the application shell. `src/shared/constants.ts` exports `APP_NAME`.

- [ ] **Step 4: Run the smoke test**

Run: `pnpm test tests/unit/smoke.test.ts`

Expected: one passing test.

- [ ] **Step 5: Commit**

```powershell
git add package.json electron.vite.config.ts tsconfig.json tsconfig.node.json vitest.config.ts src tests
git commit -m "chore: scaffold desktop application"
```

### Task 2: Typed shared contracts and secure preload bridge

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/ipc.ts`
- Create: `src/preload/api.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/unit/ipc-contract.test.ts`

**Interfaces:**
- Consumes: Electron renderer/main processes from Task 1.
- Produces: `DesktopApi`, `DocumentSummary`, `Citation`, `ChatRequest`, `ChatEvent`, `RetrievalBundle`, `ApiSettings`, and `IPC_CHANNELS`.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../../src/shared/ipc";

describe("IPC channel contract", () => {
  it("keeps names unique", () => {
    const names = Object.values(IPC_CHANNELS);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("chat:ask");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/unit/ipc-contract.test.ts`

Expected: fail because `IPC_CHANNELS` is missing.

- [ ] **Step 3: Define the shared types and whitelist channels**

Define exact request and response types for settings, documents, import jobs, conversations, retrieval, chat streaming, and document bytes. The preload bridge exposes only named methods and event subscriptions.

- [ ] **Step 4: Run all unit tests**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/shared src/preload tests/unit/ipc-contract.test.ts
git commit -m "feat: define secure desktop contracts"
```

### Task 3: Persistent SQLite schema and settings

**Files:**
- Create: `src/main/storage/database.ts`
- Create: `src/main/storage/schema.ts`
- Create: `src/main/storage/settings-store.ts`
- Create: `src/main/config/paths.ts`
- Create: `src/main/security/secret-store.ts`
- Test: `tests/unit/database.test.ts`
- Test: `tests/integration/settings-persistence.test.ts`

**Interfaces:**
- Consumes: shared types from Task 2.
- Produces: `AppDatabase.open(root)`, `database.save()`, `database.query(sql, params)`, `database.run(sql, params)`, `SettingsStore.load()`, `SettingsStore.save()`, `SecretStore.setApiKey()`, and `SecretStore.getApiKey()`.

- [ ] **Step 1: Write the failing database test**

```ts
it("stores a document and retrieves it by hash", async () => {
  const db = await AppDatabase.open(tempRoot);
  await db.run(
    "INSERT INTO documents (id, sha256, title, original_filename, stored_path, kind, page_count, status, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["d1", "abc", "Manual", "manual.pdf", "library/manual.pdf", "pdf", 10, "ready", "{}", 1, 1]
  );
  await db.save();
  expect(await db.findDocumentByHash("abc")).toMatchObject({ id: "d1", title: "Manual" });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/unit/database.test.ts`

Expected: fail because the database class and schema do not exist.

- [ ] **Step 3: Implement schema creation, migration metadata, persistence, and secret encryption adapter**

Create all tables named in the spec. Add indexes on `documents.sha256`, `chunks.document_id`, `chunks.page_number`, and `messages.conversation_id`. Use atomic temp-file replacement when saving.

- [ ] **Step 4: Run database and settings tests**

Run: `pnpm test tests/unit/database.test.ts tests/integration/settings-persistence.test.ts`

Expected: pass, including persistence after reopening the database.

- [ ] **Step 5: Commit**

```powershell
git add src/main/storage src/main/config src/main/security tests
git commit -m "feat: add persistent local knowledge store"
```

### Task 4: PDF, workbook, and image extraction

**Files:**
- Create: `src/main/ingestion/file-hash.ts`
- Create: `src/main/ingestion/pdf-extractor.ts`
- Create: `src/main/ingestion/xlsx-extractor.ts`
- Create: `src/main/ingestion/image-extractor.ts`
- Create: `src/main/ingestion/chunker.ts`
- Test: `tests/unit/chunker.test.ts`
- Test: `tests/integration/pdf-extraction.test.ts`
- Test: `tests/integration/xlsx-extraction.test.ts`

**Interfaces:**
- Consumes: Task 3 database records.
- Produces: `hashFile(path)`, `extractPdf(path)`, `extractWorkbook(path)`, `extractImage(path)`, and `chunkPages(pages)`.

- [ ] **Step 1: Write the failing chunker test**

```ts
it("never joins text from two pages", () => {
  const chunks = chunkPages([
    { pageNumber: 1, text: "A".repeat(900), printedPage: "1" },
    { pageNumber: 2, text: "B".repeat(100), printedPage: "2" }
  ]);
  expect(chunks.every((chunk) => chunk.text.split("").every((char) => char === "A" || char === "B"))).toBe(true);
  expect(chunks.some((chunk) => chunk.pageNumber === 1 && chunk.text.includes("B"))).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/unit/chunker.test.ts`

Expected: fail because `chunkPages` is missing.

- [ ] **Step 3: Implement file hashing, extraction, page coordinates, bookmarks, workbook rows, and page-safe chunking**

PDF extraction returns page text and text items. Bookmark destinations are resolved to one-based physical pages. XLSX extraction returns each sheet as a logical page and preserves row numbers. Images return a one-page descriptor containing the file title and dimensions.

- [ ] **Step 4: Run extraction tests against the supplied manuals**

Run: `pnpm test tests/unit/chunker.test.ts tests/integration/pdf-extraction.test.ts tests/integration/xlsx-extraction.test.ts`

Expected: the reference manual has 755 pages, the programming manual has 156, and the pin workbook has 50 rows.

- [ ] **Step 5: Commit**

```powershell
git add src/main/ingestion tests
git commit -m "feat: extract STM32 manual content"
```

### Task 5: Import service and knowledge library management

**Files:**
- Create: `src/main/ingestion/import-service.ts`
- Create: `src/main/ingestion/job-store.ts`
- Create: `src/main/library/library-service.ts`
- Test: `tests/integration/import-dedup.test.ts`
- Test: `tests/integration/library-delete.test.ts`

**Interfaces:**
- Consumes: extraction functions from Task 4 and `AppDatabase`.
- Produces: `ImportService.importPaths(paths, onProgress)`, `LibraryService.list()`, `LibraryService.remove(documentId)`, and `LibraryService.retry(documentId)`.

- [ ] **Step 1: Write the failing duplicate import test**

```ts
it("indexes identical files once", async () => {
  const service = await createImportService(tempRoot);
  const first = await service.importPaths([fixturePdf]);
  const second = await service.importPaths([fixturePdfCopy]);
  expect(first[0].status).toBe("imported");
  expect(second[0].status).toBe("duplicate");
  expect(await service.listDocuments()).toHaveLength(1);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/integration/import-dedup.test.ts`

Expected: fail because `createImportService` is missing.

- [ ] **Step 3: Implement import staging, hash dedup, copied library paths, job checkpoints, retry, and deletion**

Copy only after duplicate detection. Save the database after each completed document so an interrupted run can resume. Emit progress events with document id, stage, completed count, total count, and message.

- [ ] **Step 4: Run import and library tests**

Run: `pnpm test tests/integration/import-dedup.test.ts tests/integration/library-delete.test.ts`

Expected: all tests pass and duplicate import leaves one document.

- [ ] **Step 5: Commit**

```powershell
git add src/main/ingestion src/main/library tests/integration
git commit -m "feat: import and deduplicate local manuals"
```

### Task 6: Query analysis, FTS, vector search, and RRF

**Files:**
- Create: `src/main/search/query-analyzer.ts`
- Create: `src/main/search/lexical-search.ts`
- Create: `src/main/search/vector-search.ts`
- Create: `src/main/search/rrf.ts`
- Create: `src/main/search/retrieval-service.ts`
- Test: `tests/unit/query-analyzer.test.ts`
- Test: `tests/unit/rrf.test.ts`
- Test: `tests/integration/retrieval.test.ts`

**Interfaces:**
- Consumes: chunks, pages, documents, and embeddings from Task 5.
- Produces: `analyzeQuery(text)`, `LexicalSearch.search(analysis, limit)`, `VectorSearch.search(vector, limit)`, `reciprocalRankFusion(lists)`, and `RetrievalService.retrieve(question)` returning `RetrievalBundle`.

- [ ] **Step 1: Write the failing query analysis test**

```ts
it("extracts chip, pin and peripheral identifiers", () => {
  const analysis = analyzeQuery("STM32F103C8T6 的 PA9 怎么配置成 USART1_TX");
  expect(analysis.chipModels).toContain("STM32F103C8T6");
  expect(analysis.identifiers).toEqual(expect.arrayContaining(["PA9", "USART1_TX"]));
  expect(analysis.peripherals).toContain("USART");
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/unit/query-analyzer.test.ts`

Expected: fail because `analyzeQuery` is missing.

- [ ] **Step 3: Implement analysis, FTS query generation, embedding retrieval, and RRF**

Normalize identifiers to uppercase while retaining original query text for embeddings. Convert Chinese text into searchable unigram and bigram terms. Apply aliases such as `串口 -> UART USART`, `时钟树 -> RCC AHB APB`, and `中断控制器 -> NVIC`.

- [ ] **Step 4: Run search tests**

Run: `pnpm test tests/unit/query-analyzer.test.ts tests/unit/rrf.test.ts tests/integration/retrieval.test.ts`

Expected: expected manual pages rank for the PA9/USART1 sample question.

- [ ] **Step 5: Commit**

```powershell
git add src/main/search tests/unit tests/integration/retrieval.test.ts
git commit -m "feat: add page-anchored hybrid retrieval"
```

### Task 7: OpenAI-compatible chat and embedding client

**Files:**
- Create: `src/main/api/openai-client.ts`
- Create: `src/main/api/stream-parser.ts`
- Create: `src/main/api/key-redaction.ts`
- Create: `src/main/api/api-test-service.ts`
- Test: `tests/unit/stream-parser.test.ts`
- Test: `tests/unit/key-redaction.test.ts`
- Test: `tests/integration/api-client.test.ts`

**Interfaces:**
- Consumes: `ApiSettings` and encrypted keys from Task 3.
- Produces: `OpenAIClient.chatStream(request)`, `OpenAIClient.embed(inputs)`, `testChatConnection(settings)`, and `testEmbeddingConnection(settings)`.

- [ ] **Step 1: Write the failing stream parser test**

```ts
it("extracts text deltas across chunk boundaries", () => {
  const parser = new StreamParser();
  const first = parser.push('data: {"choices":[{"delta":{"content":"US'));
  const second = parser.push('ART1"}}]}\n\ndata: [DONE]\n\n');
  expect([...first, ...second].join("")).toBe("USART1");
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/unit/stream-parser.test.ts`

Expected: fail because `StreamParser` is missing.

- [ ] **Step 3: Implement request construction, streaming SSE parsing, batching, timeout, retry, and redaction**

Normalize Base URLs without adding duplicate `/v1`. Send bearer authentication. Retry only network errors and HTTP 429/5xx, with bounded exponential backoff. Redact keys from errors and logs.

- [ ] **Step 4: Run API tests**

Run: `pnpm test tests/unit/stream-parser.test.ts tests/unit/key-redaction.test.ts tests/integration/api-client.test.ts`

Expected: all tests pass with the fake HTTP server.

- [ ] **Step 5: Commit**

```powershell
git add src/main/api tests
git commit -m "feat: connect configurable model APIs"
```

### Task 8: Citation-constrained chat orchestration

**Files:**
- Create: `src/main/chat/prompt-builder.ts`
- Create: `src/main/chat/citation-parser.ts`
- Create: `src/main/chat/chat-service.ts`
- Create: `src/main/chat/conversation-store.ts`
- Test: `tests/unit/citation-parser.test.ts`
- Test: `tests/integration/chat-with-mock-api.test.ts`

**Interfaces:**
- Consumes: `RetrievalService`, `OpenAIClient`, database conversations.
- Produces: `buildAnswerPrompt(question, sources)`, `parseCitations(answer, sources)`, and `ChatService.ask(request, emit)`.

- [ ] **Step 1: Write the failing citation parser test**

```ts
it("maps source labels back to exact pages", () => {
  const citations = parseCitations("PA9 uses alternate function mode [S2].", [
    source("s1", 100),
    source("s2", 172)
  ]);
  expect(citations).toEqual([expect.objectContaining({ sourceId: "s2", pageNumber: 172 })]);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/unit/citation-parser.test.ts`

Expected: fail because `parseCitations` is missing.

- [ ] **Step 3: Implement prompt construction, streaming event emission, citation mapping, persistence, and no-API fallback**

No-API fallback returns an explanatory message plus retrieval sources and never invents technical content. The service persists user and assistant messages after terminal success or error.

- [ ] **Step 4: Run chat tests**

Run: `pnpm test tests/unit/citation-parser.test.ts tests/integration/chat-with-mock-api.test.ts`

Expected: exact source ids are persisted and returned.

- [ ] **Step 5: Commit**

```powershell
git add src/main/chat tests
git commit -m "feat: generate cited manual answers"
```

### Task 9: Electron IPC integration and process lifecycle

**Files:**
- Create: `src/main/ipc/register-handlers.ts`
- Create: `src/main/services/app-services.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/integration/ipc-handlers.test.ts`

**Interfaces:**
- Consumes: all main services from Tasks 3-8.
- Produces: typed handlers for settings, documents, import, library, conversation history, retrieval, chat events, document bytes, workbook data, and image bytes.

- [ ] **Step 1: Write the failing handler test**

```ts
it("returns document summaries without absolute stored paths", async () => {
  const handler = createLibraryListHandler(fakeService);
  const result = await handler();
  expect(result[0]).not.toHaveProperty("storedPath");
  expect(result[0]).toHaveProperty("id");
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/integration/ipc-handlers.test.ts`

Expected: fail because `createLibraryListHandler` is missing.

- [ ] **Step 3: Register handlers, enforce schema validation, and wire app startup/shutdown**

Validate all IPC input with small guards. Close and save the database on `before-quit`. Recover unfinished import jobs after startup.

- [ ] **Step 4: Run IPC and all non-UI tests**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/main src/preload tests
git commit -m "feat: expose restricted desktop operations"
```

### Task 10: Three-pane React workspace

**Files:**
- Create: `src/renderer/src/state/app-store.ts`
- Create: `src/renderer/src/components/AppShell.tsx`
- Create: `src/renderer/src/components/LeftSidebar.tsx`
- Create: `src/renderer/src/components/ChatPane.tsx`
- Create: `src/renderer/src/components/MessageBubble.tsx`
- Create: `src/renderer/src/components/CitationCard.tsx`
- Create: `src/renderer/src/components/Composer.tsx`
- Create: `src/renderer/src/components/ReaderPane.tsx`
- Create: `src/renderer/src/components/SettingsDialog.tsx`
- Create: `src/renderer/src/components/LibraryDialog.tsx`
- Create: `src/renderer/src/styles.css`
- Test: `tests/unit/app-store.test.ts`
- Test: `tests/unit/citation-card.test.tsx`

**Interfaces:**
- Consumes: `window.stm32` preload API from Task 9.
- Produces: interactive shell with conversation list, documents, streaming messages, citations, settings, library management, and reader state.

- [ ] **Step 1: Write the failing store test**

```ts
it("opens the first cited page after an answer completes", () => {
  const store = createAppStore();
  store.completeAnswer({
    messageId: "m1",
    content: "PA9 is USART1_TX [S1].",
    citations: [citation({ documentId: "d1", pageNumber: 172 })]
  });
  expect(store.getState().reader).toMatchObject({ documentId: "d1", pageNumber: 172 });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/unit/app-store.test.ts`

Expected: fail because `createAppStore` is missing.

- [ ] **Step 3: Implement the three-pane workspace**

Use a restrained technical visual direction with neutral surfaces, blue-green accents, compact controls, visible focus states, and no marketing hero. Left and right panes can collapse. The center composer remains visible while messages scroll. Settings and library management use modal dialogs.

- [ ] **Step 4: Run component tests and production build**

Run: `pnpm test tests/unit/app-store.test.ts tests/unit/citation-card.test.tsx`

Run: `pnpm build`

Expected: tests pass and Electron/Vite build exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer tests/unit
git commit -m "feat: build desktop knowledge workspace"
```

### Task 11: Integrated PDF, workbook, and image reader

**Files:**
- Create: `src/renderer/src/components/reader/PdfReader.tsx`
- Create: `src/renderer/src/components/reader/PdfOutline.tsx`
- Create: `src/renderer/src/components/reader/PdfPage.tsx`
- Create: `src/renderer/src/components/reader/WorkbookReader.tsx`
- Create: `src/renderer/src/components/reader/ImageReader.tsx`
- Create: `src/renderer/src/lib/pdf.ts`
- Test: `tests/unit/pdf-locate.test.ts`
- Test: `tests/e2e/reader.spec.ts`

**Interfaces:**
- Consumes: document bytes and page metadata through preload.
- Produces: a reader that opens a document/page, renders PDF text layer, supports outline/page navigation/zoom, renders workbooks, and highlights matching citation excerpts.

- [ ] **Step 1: Write the failing page-location test**

```ts
it("clamps requested pages to the PDF page range", () => {
  expect(resolvePageNumber(0, 10)).toBe(1);
  expect(resolvePageNumber(11, 10)).toBe(10);
  expect(resolvePageNumber(4, 10)).toBe(4);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/unit/pdf-locate.test.ts`

Expected: fail because `resolvePageNumber` is missing.

- [ ] **Step 3: Implement PDF.js rendering and alternative document readers**

Configure the PDF.js worker through Electron Vite. Render one page on demand, preserve the selected page, and dispose page/render tasks when switching. Apply `citation-match` spans where excerpt text can be matched.

- [ ] **Step 4: Run reader tests and manual Electron smoke test**

Run: `pnpm test tests/unit/pdf-locate.test.ts`

Run: `pnpm test:e2e tests/e2e/reader.spec.ts`

Expected: the reference manual opens on page 172 for the PA9 citation.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/src/components/reader src/renderer/src/lib tests
git commit -m "feat: integrate original manual reader"
```

### Task 12: Seed supplied knowledge base and verify real retrieval

**Files:**
- Create: `scripts/seed-library.mjs`
- Create: `resources/library-manifest.json`
- Create: `tests/integration/supplied-corpus.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: import service and extractors.
- Produces: `D:\STM32RAG智能体\data\library` populated from the supplied PDFs, workbook, and image; indexed database without requiring an embedding API.

- [ ] **Step 1: Write the failing corpus test**

```ts
it("deduplicates the two identical datasheets", async () => {
  const result = await importManifest(manifest, {
    dataRoot,
    includeEmbeddings: false
  });
  expect(result.imported).toBe(6);
  expect(result.duplicate).toBe(1);
  expect(result.documents).toHaveLength(6);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/integration/supplied-corpus.test.ts`

Expected: fail because the manifest and seed script are missing.

- [ ] **Step 3: Implement the seed command and populate the real D-drive data root**

Run indexing with FTS only. Keep embeddings empty and mark them `not_generated` until the user configures an embedding API. Verify page counts and directory data from SQLite.

- [ ] **Step 4: Run corpus and retrieval tests**

Run: `pnpm test tests/integration/supplied-corpus.test.ts tests/integration/retrieval.test.ts`

Expected: six documents, one duplicate, approximately 1695 logical PDF pages including the single-page image, and non-empty results for the PA9/USART1 question.

- [ ] **Step 5: Commit**

```powershell
git add scripts resources tests/integration/supplied-corpus.test.ts README.md
git commit -m "feat: seed supplied STM32 knowledge base"
```

### Task 13: Windows packaging, shortcut, and final verification

**Files:**
- Create: `electron-builder.yml`
- Create: `resources/icon.svg`
- Create: `scripts/generate-icons.mjs`
- Create: `tests/e2e/app.spec.ts`
- Create: `README.md`
- Modify: `package.json`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: complete application.
- Produces: `release\STM32 手册智能体 Setup <version>.exe`, desktop shortcut behavior, and repeatable verification commands.

- [ ] **Step 1: Write the failing packaging configuration test**

```ts
it("declares a Windows NSIS shortcut", () => {
  expect(builderConfig.nsis.createDesktopShortcut).toBe(true);
  expect(builderConfig.appId).toBe("com.local.stm32rag");
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test tests/unit/builder-config.test.ts`

Expected: fail because `electron-builder.yml` is missing.

- [ ] **Step 3: Add icon generation, Windows packaging, desktop shortcut, first-run data-root selection, and user documentation**

Generate `.ico` and `.png` application icons from a code-native chip/document SVG. Configure NSIS with `createDesktopShortcut: true`.

- [ ] **Step 4: Run complete verification**

Run: `pnpm test`

Run: `pnpm build`

Run: `pnpm test:e2e`

Run: `pnpm dist:win`

Expected: every command exits 0 and the installer exists in `release`.

- [ ] **Step 5: Install and smoke-test the packaged application**

Install the NSIS package, confirm the desktop shortcut, launch the app, verify the six seeded documents, ask the sample question without an API, confirm retrieval and page opening, configure a fake or real compatible endpoint, and verify cited streaming output.

- [ ] **Step 6: Commit**

```powershell
git add electron-builder.yml resources scripts tests/e2e README.md package.json src/main/index.ts
git commit -m "build: package Windows desktop agent"
```

## Plan Self-Review

- Spec coverage: all required storage, ingestion, retrieval, chat, UI, reader, security, packaging, and verification items map to Tasks 1-13.
- Placeholder scan: no unresolved placeholders or unassigned work.
- Type consistency: shared types are defined in Task 2 and consumed by later tasks; database, retrieval, API, chat, and preload interfaces use stable names across tasks.
