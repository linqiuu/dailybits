import { NextRequest, NextResponse } from "next/server";
import { canAccessBank, getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCachedItems } from "@/lib/digest/delivery";
import { getAiNewsDigestCacheDate } from "@/lib/digest/sources";
import { buildMessagingCardRequest } from "@/lib/push/adapter";
import { dateKey } from "@/lib/time";

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const kind = request.nextUrl.searchParams.get("kind") || "AI_NEWS";
    const receiver = session.user.uid || "preview";
    if (kind === "KNOWLEDGE") {
      const banks = await prisma.knowledgeBank.findMany({ where: { OR: [{ visibility: "PUBLIC" }, { creatorId: session.user.id }, { visibility: "PARTIAL", visibleDepartments: { hasSome: session.user.departmentIds } }] }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } });
      const bankId = request.nextUrl.searchParams.get("bankId") || banks[0]?.id;
      if (!bankId) return NextResponse.json({ pages: [], banks });
      const bank = await prisma.knowledgeBank.findUnique({ where: { id: bankId }, include: { points: { orderBy: { orderIndex: "asc" }, take: 1 } } });
      if (!bank || !canAccessBank(bank, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const point = bank.points[0];
      const card = point ? buildMessagingCardRequest({ receiver, title: bank.title, items: [point.content], knowledgeBankId: bank.id, knowledgePointId: point.id }) : null;
      return NextResponse.json({ banks, selectedBankId: bank.id, title: bank.title, pages: card ? [card.content] : [], fetchedAt: point?.updatedAt ?? null });
    }
    if (kind !== "AI_NEWS" && kind !== "GITHUB_TRENDING") return NextResponse.json({ error: "Invalid preview type" }, { status: 400 });
    const digestDate = kind === "AI_NEWS" ? getAiNewsDigestCacheDate(new Date(), "Asia/Shanghai") : dateKey(new Date());
    const cache = await prisma.digestCache.findUnique({ where: { digestType_digestDate: { digestType: kind, digestDate } } });
    const items = parseCachedItems(cache?.items);
    const title = kind === "AI_NEWS" ? "AI 新闻日报" : "GitHub 热榜日报";
    const card = items ? buildMessagingCardRequest({ receiver, title, items, digestType: kind, digestDate }) : null;
    return NextResponse.json({ title, digestDate, pages: card?.content ?? [], fetchedAt: cache?.fetchedAt ?? null });
  } catch {
    return NextResponse.json({ error: "Preview temporarily unavailable" }, { status: 503 });
  }
}
