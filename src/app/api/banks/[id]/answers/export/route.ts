import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  AnswerQueryError,
  canReadAnswerDetails,
  parseAnswerFilters,
} from "@/lib/answers/query";
import { exportAnswerRecords } from "@/lib/answers/export";
import { dateKey } from "@/lib/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getCurrentSession();
    if (!session)
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { id } = await params;
    const bank = await prisma.questionBank.findUnique({
      where: { id },
      select: { title: true, creatorId: true },
    });
    if (!bank)
      return NextResponse.json({ error: "题库不存在" }, { status: 404 });
    if (!canReadAnswerDetails(bank, session.user))
      return NextResponse.json(
        { error: "只有题库创建者和管理员可以导出答题记录" },
        { status: 403 },
      );
    const bytes = await exportAnswerRecords(
      prisma,
      id,
      bank.title,
      parseAnswerFilters(request.nextUrl.searchParams),
    );
    const filename = `答题记录-${bank.title.replace(/[\x00-\x1f\\/:*?"<>|]/g, "_").slice(0, 60)}-${dateKey(new Date())}.xlsx`;
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="answer-records.xlsx"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, "%27")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AnswerQueryError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("[Answers] Failed to export records");
    return NextResponse.json(
      { error: "导出失败，请稍后重试" },
      { status: 503 },
    );
  }
}
