import * as XLSX from "xlsx";
import type { PrismaClient } from "../../generated/prisma/client";
import { DISPLAY_TIMEZONE } from "../time";
import {
  answerOrder,
  answerSelect,
  answerWhere,
  answerView,
  AnswerQueryError,
  type AnswerFilters,
  type AnswerRecordView,
} from "./query";

export const MAX_ANSWER_EXPORT_ROWS = 50000;
export function answerTimeLabel(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
export function answerWorkbook(
  bankTitle: string,
  records: AnswerRecordView[],
): Buffer {
  const rows: Array<Array<string>> = [
    [
      "姓名",
      "工号",
      "账号",
      "题库",
      "题目",
      "所选答案",
      "正确答案",
      "正确情况",
      "答题时间（北京时间）",
      "人员资料状态",
      "资料采集时间（北京时间）",
      "资料来源",
      "题目快照",
      "记录 ID",
    ],
  ];
  for (const row of records)
    rows.push([
      row.name || "",
      row.employeeNo || "",
      row.accountId,
      bankTitle,
      row.question,
      row.selectedAnswer,
      row.correctAnswer,
      row.isCorrect ? "正确" : "错误",
      answerTimeLabel(row.answeredAt),
      row.identityStatus === "RESOLVED"
        ? "已补全"
        : row.identityStatus === "NOT_FOUND"
          ? "目录未找到"
          : "待补全",
      answerTimeLabel(row.identityCapturedAt),
      row.identityBackfilled ? "历史资料后补" : "记录后首次采集",
      row.questionSnapshotAvailable ? "记录时题目" : "旧记录：当前题目内容",
      row.id,
    ]);
  if (rows.some((row) => row.some((cell) => cell.length > 32767)))
    throw new AnswerQueryError(
      "题目内容超过 Excel 单元格长度限制，请缩小筛选范围或单独复制该题全文",
      422,
    );
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [12, 16, 20, 24, 65, 10, 10, 12, 26, 16, 26, 20, 28, 30].map(
    (wch) => ({ wch }),
  );
  sheet["!autofilter"] = { ref: sheet["!ref"]! };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "答题记录");
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  });
}

export async function exportAnswerRecords(
  prisma: PrismaClient,
  bankId: string,
  bankTitle: string,
  filters: AnswerFilters,
): Promise<Buffer> {
  const records = await prisma.$transaction(
    async (tx) => {
      const where = answerWhere(bankId, filters);
      if (
        (await tx.questionAnswerEvent.count({ where })) > MAX_ANSWER_EXPORT_ROWS
      )
        throw new AnswerQueryError(
          "匹配记录超过 50000 条，请缩小日期范围后导出",
          422,
        );
      return tx.questionAnswerEvent.findMany({
        where,
        select: answerSelect,
        orderBy: answerOrder(filters.sort),
        take: MAX_ANSWER_EXPORT_ROWS,
      });
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
  return answerWorkbook(bankTitle, records.map(answerView));
}
