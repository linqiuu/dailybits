import * as XLSX from "xlsx";
import { parse } from "csv-parse/sync";
import type { GeneratedQuestion } from "@/types";

type ColumnKey =
  | "题干"
  | "选项A"
  | "选项B"
  | "选项C"
  | "选项D"
  | "正确答案"
  | "解析";

/**
 * Parse Excel (.xlsx) or CSV file buffer into GeneratedQuestion[]
 * Expected columns: 题干 | 选项A | 选项B | 选项C | 选项D | 正确答案 | 解析
 */
export function parseExcelOrCsv(buffer: Buffer, filename?: string): GeneratedQuestion[] {
  const ext = filename?.toLowerCase().split(".").pop() ?? "";
  const isCsv = ext === "csv";

  if (isCsv) {
    return parseCsv(buffer);
  }
  return parseXlsx(buffer);
}

function parseXlsx(buffer: Buffer): GeneratedQuestion[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  return mapRowsToQuestions(data);
}

function parseCsv(buffer: Buffer): GeneratedQuestion[] {
  const text = buffer.toString("utf-8");
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const data = records.map((r) => {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      row[k.trim()] = v ?? "";
    }
    return row;
  });

  return mapRowsToQuestions(data);
}

function mapRowsToQuestions(rows: Record<string, unknown>[]): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];

  for (const row of rows) {
    const content = getCell(row, "题干");
    const optA = getCell(row, "选项A");
    const optB = getCell(row, "选项B");
    const optC = getCell(row, "选项C");
    const optD = getCell(row, "选项D");
    const correctAnswer = getCell(row, "正确答案");
    const explanation = getCell(row, "解析");

    if (!content?.trim()) continue;

    const rawOpts = [optA, optB, optC, optD].map((o) =>
      o != null && String(o).trim() !== "" ? String(o).trim() : ""
    );
    if (rawOpts.filter((o) => o).length < 2) continue;

    const normalizedAnswer = normalizeAnswer(correctAnswer);
    if (!normalizedAnswer || !["A", "B", "C", "D"].includes(normalizedAnswer)) continue;

    questions.push({
      content: String(content).trim(),
      options: rawOpts,
      correctAnswer: normalizedAnswer,
      explanation: explanation != null ? String(explanation).trim() : "",
    });
  }

  return questions;
}

function getCell(row: Record<string, unknown>, col: ColumnKey): string | undefined {
  const val = row[col];
  if (val == null) return undefined;
  return String(val).trim() || undefined;
}

function normalizeAnswer(val: string | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim().toUpperCase();
  if (["A", "B", "C", "D"].includes(s)) return s;
  const idx = "ABCD".indexOf(s.charAt(0));
  if (idx >= 0) return "ABCD"[idx];
  return null;
}
