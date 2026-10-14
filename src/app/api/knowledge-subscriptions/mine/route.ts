import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listKnowledgeSubscriptions } from "@/lib/subscriptions/listing";
export async function GET() {
  const session = await getCurrentSession();
  if (!session)
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    return NextResponse.json(
      await listKnowledgeSubscriptions(prisma, "USER", session.user.id),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "订阅列表加载失败" }, { status: 503 });
  }
}
