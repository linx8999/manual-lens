import XLSX from "xlsx";
import type { WorkbookSheet } from "../../shared/types";

export interface WorkbookExtraction {
  title: string;
  sheets: WorkbookSheet[];
}

export async function extractWorkbook(path: string): Promise<WorkbookExtraction> {
  const workbook = XLSX.readFile(path, {
    cellDates: false,
    cellNF: false,
    cellStyles: false
  });
  const sheets = workbook.SheetNames.map((name, index) => {
    const worksheet = workbook.Sheets[name];
    const rawRows = worksheet
      ? (XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
          defval: null,
          blankrows: false
        }) as Array<Array<string | number | boolean | null>>)
      : [];
    const rows = trimEmptyRows(rawRows);

    return {
      name,
      rows,
      pageNumber: index + 1
    };
  });

  return {
    title: workbook.Props?.Title || path.split(/[\\/]/).pop() || "Excel 资料",
    sheets
  };
}

function trimEmptyRows(
  rows: Array<Array<string | number | boolean | null>>
): Array<Array<string | number | boolean | null>> {
  let lastNonEmpty = -1;
  rows.forEach((row, index) => {
    if (row.some((cell) => cell !== null && String(cell).trim() !== "")) {
      lastNonEmpty = index;
    }
  });
  return rows.slice(0, lastNonEmpty + 1);
}
