import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  const headers = ["题干", "选项A", "选项B", "选项C", "选项D", "正确答案", "解析"];
  const sampleRow = [
    "TypeScript 是哪家公司维护的？",
    "Google",
    "Microsoft",
    "Meta",
    "Apple",
    "B",
    "TypeScript 由 Microsoft 主导维护。",
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "题目模板");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = "question-import-template.xlsx";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
