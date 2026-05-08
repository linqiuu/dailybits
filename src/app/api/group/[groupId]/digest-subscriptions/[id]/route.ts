import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MAX_PUSH_TIMES_PER_SUBSCRIPTION } from "@/types";

type RouteContext = { params: Promise<{ groupId: string; id: string }> };

function parsePushTimes(value: unknown): string[] | NextResponse {
  if (!Array.isArray(value) || value.length === 0) {
    return NextResponse.json(
      { error: "pushTimes must be a non-empty array" },
      { status: 400 },
    );
  }
  const validTimes = value.filter(
    (time) => typeof time === "string" && /^\d{2}:\d{2}$/.test(time),
  );
  if (validTimes.length === 0) {
    return NextResponse.json(
      { error: "pushTimes must contain valid HH:MM format strings" },
      { status: 400 },
    );
  }
  if (validTimes.length > MAX_PUSH_TIMES_PER_SUBSCRIPTION) {
    return NextResponse.json(
      { error: `pushTimes cannot exceed ${MAX_PUSH_TIMES_PER_SUBSCRIPTION}` },
      { status: 400 },
    );
  }
  if (validTimes.length !== 1) {
    return NextResponse.json(
      { error: "digest subscriptions support exactly one daily push time" },
      { status: 400 },
    );
  }
  return [...new Set(validTimes)].sort();
}

async function findGroupDigestSubscription(id: string, groupId: string) {
  const subscription = await prisma.digestSubscription.findUnique({
    where: { id },
  });
  if (!subscription) {
    return { error: "Digest subscription not found", status: 404, subscription: null };
  }
  if (subscription.targetType !== "GROUP" || subscription.targetId !== groupId) {
    return { error: "Forbidden", status: 403, subscription: null };
  }
  return { error: null, status: 200, subscription };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { groupId, id } = await context.params;
    const auth = await findGroupDigestSubscription(id, groupId);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const pushTimes = parsePushTimes((body as { pushTimes?: unknown }).pushTimes);
    if (pushTimes instanceof NextResponse) return pushTimes;

    const updated = await prisma.digestSubscription.update({
      where: { id },
      data: { pushTimes },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/group/[groupId]/digest-subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update group digest subscription" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { groupId, id } = await context.params;
    const auth = await findGroupDigestSubscription(id, groupId);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await prisma.digestSubscription.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/group/[groupId]/digest-subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete group digest subscription" },
      { status: 500 },
    );
  }
}
