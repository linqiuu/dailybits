import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AnswerEventError, recordAnswerEvent } from "@/lib/qa-events";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const expected = process.env.CARD_SERVICE_EVENT_SECRET?.trim();
  if (!expected) return process.env.AUTH_MODE === "dev" && process.env.NODE_ENV !== "production" && process.env.APP_ENV !== "production";
  const supplied = request.headers.get(process.env.CARD_SERVICE_EVENT_SECRET_HEADER || "X-Card-Event-Secret") || "";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid JSON object" }, { status: 400 });
    const event = await recordAnswerEvent(prisma, body as Record<string, unknown>);
    return NextResponse.json({ ok: true, id: event.id, bankId: event.bankId, questionId: event.questionId });
  } catch (error) {
    if (error instanceof AnswerEventError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("[QA] Failed to record answer event");
    return NextResponse.json({ error: "Failed to record QA answer event" }, { status: 500 });
  }
}
