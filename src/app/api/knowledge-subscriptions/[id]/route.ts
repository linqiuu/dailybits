import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateLearningSubscription } from "@/lib/subscriptions/service";
import { SubscriptionPolicyError } from "@/lib/subscriptions/policy";
type Context = { params: Promise<{ id: string }> };
async function update(request: NextRequest, context: Context, cancel: boolean) {
  try {
    const session = await getCurrentSession();
    if (!session)
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { id } = await context.params;
    const body = cancel ? { action: "cancel" } : await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
    const result = await updateLearningSubscription(
      prisma,
      "KNOWLEDGE",
      id,
      session.user,
      body,
    );
    return NextResponse.json(cancel ? { success: true } : result);
  } catch (error) {
    if (error instanceof SubscriptionPolicyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
    console.error("[Subscriptions] Update failed");
    return NextResponse.json(
      { error: "订阅更新失败，请稍后重试" },
      { status: 503 },
    );
  }
}
export function PATCH(request: NextRequest, context: Context) {
  return update(request, context, false);
}
export function DELETE(request: NextRequest, context: Context) {
  return update(request, context, true);
}
