import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLearningSubscription } from "@/lib/subscriptions/service";
import { listKnowledgeSubscriptions } from "@/lib/subscriptions/listing";
import {
  RESERVED_STATUSES,
  SubscriptionPolicyError,
} from "@/lib/subscriptions/policy";
import { MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET } from "@/types";
export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session)
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const targetType = request.nextUrl.searchParams.get("targetType") ?? "USER";
  const targetId =
    targetType === "USER"
      ? session.user.id
      : request.nextUrl.searchParams.get("targetId");
  if ((targetType !== "USER" && targetType !== "GROUP") || !targetId)
    return NextResponse.json({ error: "订阅目标无效" }, { status: 400 });
  try {
    const subscriptions = await listKnowledgeSubscriptions(
      prisma,
      targetType,
      targetId,
      targetType === "GROUP" && !session.user.isAdmin
        ? session.user.id
        : undefined,
    );
    const count = await prisma.knowledgeSubscription.count({
      where: { targetType, targetId, status: { in: [...RESERVED_STATUSES] } },
    });
    return NextResponse.json(
      { subscriptions, count, limit: MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "知识订阅加载失败" }, { status: 503 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session)
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
    return NextResponse.json(
      await createLearningSubscription(prisma, "KNOWLEDGE", session.user, body),
    );
  } catch (error) {
    if (error instanceof SubscriptionPolicyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
    console.error("[Knowledge subscriptions] Create failed");
    return NextResponse.json(
      { error: "订阅失败，请稍后重试" },
      { status: 503 },
    );
  }
}
