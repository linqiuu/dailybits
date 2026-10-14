import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLearningSubscription } from "@/lib/subscriptions/service";
import { listQuestionSubscriptions } from "@/lib/subscriptions/listing";
import {
  RESERVED_STATUSES,
  SubscriptionPolicyError,
} from "@/lib/subscriptions/policy";
import { MAX_SUBSCRIPTIONS_PER_TARGET } from "@/types";
type Context = { params: Promise<{ groupId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  const session = await getCurrentSession();
  if (!session)
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { groupId } = await context.params;
  try {
    const subscriptions = await listQuestionSubscriptions(
      prisma,
      "GROUP",
      groupId,
      session.user.isAdmin ? undefined : session.user.id,
    );
    const count = await prisma.subscription.count({
      where: {
        targetType: "GROUP",
        targetId: groupId,
        status: { in: [...RESERVED_STATUSES] },
      },
    });
    return NextResponse.json(
      { subscriptions, count, limit: MAX_SUBSCRIPTIONS_PER_TARGET },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "群订阅加载失败" }, { status: 503 });
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await getCurrentSession();
    if (!session)
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { groupId } = await context.params;
    if (!/^\d+$/.test(groupId))
      return NextResponse.json({ error: "群号无效" }, { status: 400 });
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
    return NextResponse.json(
      await createLearningSubscription(prisma, "QUESTION", session.user, {
        ...body,
        targetType: "GROUP",
        targetId: groupId,
      }),
    );
  } catch (error) {
    if (error instanceof SubscriptionPolicyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
    return NextResponse.json(
      { error: "群订阅失败，请稍后重试" },
      { status: 503 },
    );
  }
}
