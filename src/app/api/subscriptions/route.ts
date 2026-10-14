import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLearningSubscription } from "@/lib/subscriptions/service";
import { SubscriptionPolicyError } from "@/lib/subscriptions/policy";

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session)
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
    return NextResponse.json(
      await createLearningSubscription(prisma, "QUESTION", session.user, body),
    );
  } catch (error) {
    if (error instanceof SubscriptionPolicyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
    console.error("[Subscriptions] Create failed");
    return NextResponse.json(
      { error: "订阅失败，请稍后重试" },
      { status: 503 },
    );
  }
}
