import { NextRequest, NextResponse } from "next/server";
import { authorizeSubscriptionActor } from "@/lib/subscriptions/authorization";
import { prisma } from "@/lib/prisma";
import { MAX_PUSH_TIMES_PER_SUBSCRIPTION } from "@/types";

async function authorizeDigestSubscription(subscriptionId: string) {
  const subscription = await prisma.digestSubscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    return { error: "Digest subscription not found", status: 404, subscription: null };
  }

  const denied = await authorizeSubscriptionActor(subscription);
  if (denied) return { ...denied, subscription: null };

  return { error: null, status: 200, subscription };
}

function parsePushTimes(value: unknown): string[] | NextResponse {
  if (!Array.isArray(value) || value.length === 0) {
    return NextResponse.json(
      { error: "pushTimes must be a non-empty array" },
      { status: 400 },
    );
  }
  const validTimes = value.filter(
    (time) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time),
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const auth = await authorizeDigestSubscription(id);
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
    console.error("[PATCH /api/digest-subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update digest subscription" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const auth = await authorizeDigestSubscription(id);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await prisma.digestSubscription.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/digest-subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete digest subscription" },
      { status: 500 },
    );
  }
}
