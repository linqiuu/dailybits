import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  AnswerQueryError,
  canReadAnswerDetails,
  listAnswerRecords,
  parseAnswerFilters,
} from "@/lib/answers/query";

export const dynamic = "force-dynamic";
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
      select: { creatorId: true },
    });
    if (!bank)
      return NextResponse.json({ error: "题库不存在" }, { status: 404 });
    if (!canReadAnswerDetails(bank, session.user))
      return NextResponse.json(
        { error: "只有题库创建者和管理员可以查看答题记录" },
        { status: 403 },
      );
    const result = await listAnswerRecords(
      prisma,
      id,
      parseAnswerFilters(request.nextUrl.searchParams),
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof AnswerQueryError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("[Answers] Failed to load records");
    return NextResponse.json(
      { error: "答题记录加载失败，请稍后重试" },
      { status: 503 },
    );
  }
}
