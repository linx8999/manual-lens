import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ImportService } from "../../src/main/ingestion/import-service";
import { LibraryService } from "../../src/main/library/library-service";
import { AppDatabase } from "../../src/main/storage/database";
import { samplePdf } from "../helpers/corpus";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createServices(): Promise<{
  root: string;
  database: AppDatabase;
  importer: ImportService;
  library: LibraryService;
}> {
  const root = await mkdtemp(join(tmpdir(), "stm32-rag-import-"));
  roots.push(root);
  const database = await AppDatabase.open(root);
  const importer = new ImportService({ dataRoot: root, database });
  const library = new LibraryService({ dataRoot: root, database });
  return { root, database, importer, library };
}

describe.skipIf(!samplePdf)("import pipeline", () => {
  it("indexes identical files once", async () => {
    const { database, importer } = await createServices();

    const first = await importer.importPaths([samplePdf as string]);
    const second = await importer.importPaths([samplePdf as string]);

    expect(first[0]?.status).toBe("imported");
    expect(second[0]?.status).toBe("duplicate");
    expect((await importer.listDocuments())).toHaveLength(1);
    database.close();
  }, 30000);

  it("removes the stored original when a document is deleted", async () => {
    const { root, database, importer, library } = await createServices();
    const imported = await importer.importPaths([samplePdf as string]);
    const documentId = imported[0]?.documentId;
    expect(documentId).toBeTruthy();

    const [document] = await library.list();
    expect(document?.id).toBe(documentId);
    const stored = database.query<{ stored_path: string }>(
      "SELECT stored_path FROM documents WHERE id = ?",
      documentId!
    )[0]?.stored_path;
    expect(stored).toBeTruthy();

    await library.remove(documentId!);

    expect(await library.list()).toHaveLength(0);
    await expect(access(join(root, stored!))).rejects.toThrow();
    database.close();
  }, 30000);

  it("makes imported documents ready for keyword retrieval", async () => {
    const { database, importer } = await createServices();

    const results = await importer.importPaths([samplePdf as string]);
    const documents = await importer.listDocuments();
    const [document] = documents;
    const ftsCount = database.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM chunks_fts"
    )[0]?.count;

    expect(results[0]?.status).toBe("imported");
    expect(document).toMatchObject({
      status: "ready",
      errorMessage: null
    });
    expect(document?.pageCount).toBeGreaterThan(0);
    expect(ftsCount).toBeGreaterThan(0);
    database.close();
  }, 30000);

  it("removes copied files and document rows when extraction fails", async () => {
    const { root, database, importer } = await createServices();
    const brokenPdf = join(root, "broken.pdf");
    await writeFile(brokenPdf, "not a valid pdf", "utf8");

    const results = await importer.importPaths([brokenPdf]);
    const documents = await importer.listDocuments();
    const libraryFiles = await readdir(join(root, "library"));
    const job = database.query<{ status: string; message: string | null }>(
      "SELECT status, message FROM import_jobs ORDER BY updated_at DESC LIMIT 1"
    )[0];

    expect(results[0]).toMatchObject({
      filename: "broken.pdf",
      status: "failed"
    });
    expect(documents).toHaveLength(0);
    expect(libraryFiles).toHaveLength(0);
    expect(job?.status).toBe("error");
    expect(job?.message).toBeTruthy();
    database.close();
  });
});
