import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_PUSH_TIMES_PER_SUBSCRIPTION } from "@/types";

async function authorizeDigestSubscription(subscriptionId: string, request: NextRequest) {
  const subscription = await prisma.digestSubscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    return { error: "Digest subscription not found", status: 404, subscription: null };
  }

  if (subscription.targetType === "USER") {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Unauthorized", status: 401, subscription: null };
    }
    if (subscription.targetId !== session.user.id) {
      return { error: "Forbidden", status: 403, subscription: null };
    }
  } else if (subscription.targetType === "GROUP") {
    const groupId = request.headers.get("x-group-id");
    if (groupId && subscription.targetId !== groupId) {
      return { error: "Forbidden", status: 403, subscription: null };
    }
  }

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const auth = await authorizeDigestSubscription(id, request);
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
    const auth = await authorizeDigestSubscription(id, request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await prisma.digestSubscription.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/digest-subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete digest subscription" },
      { status: 500 },
    );
  }
}
