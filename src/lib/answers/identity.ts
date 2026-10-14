import type { PrismaClient } from "../../generated/prisma/client";
import {
  batchResolveDirectoryPeople,
  DirectoryRequestError,
} from "../directory";

export async function enrichAnswerIdentities(
  prisma: PrismaClient,
  now = new Date(),
): Promise<void> {
  // One persisted lease and backoff prevents multiple schedulers exhausting Directory quotas.
  const checkpoint = await prisma.schedulerState.upsert({
    where: { id: "qa-identities" },
    create: { id: "qa-identities", lastTickAt: new Date(0) },
    update: {},
  });
  const lease = await prisma.schedulerState.updateMany({
    where: {
      id: checkpoint.id,
      updatedAt: checkpoint.updatedAt,
      OR: [{ cursor: null }, { cursor: { lte: now.toISOString() } }],
    },
    data: { cursor: new Date(now.getTime() + 120000).toISOString() },
  });
  if (!lease.count) return;
  let partiallyUnavailable = false;
  try {
    const due = await prisma.$queryRaw<
      Array<{ respondentId: string }>
    >`SELECT "respondentId" FROM "QuestionAnswerEvent" WHERE "identityStatus" != 'RESOLVED' AND "identityNextAttemptAt" <= ${now} GROUP BY "respondentId" ORDER BY min("identityNextAttemptAt"), "respondentId" LIMIT 100`;
    if (due.length) {
      const accountIds = due.map((row) => row.respondentId);
      const users = await prisma.user.findMany({
        where: {
          OR: [{ id: { in: accountIds } }, { uid: { in: accountIds } }],
        },
        select: { id: true, uid: true },
      });
      const uids = new Map(
        users.filter((user) => user.uid).map((user) => [user.id, user.uid!]),
      );
      const values = [...new Set(accountIds.map((id) => uids.get(id) || id))];
      const results = await batchResolveDirectoryPeople(
        values.map((value) => ({ type: "uid", value })),
      );
      const byUid = new Map(
        results.map((result) => [result.input.value, result]),
      );
      for (const accountId of accountIds) {
        const result = byUid.get(uids.get(accountId) || accountId)!;
        const where = {
          respondentId: accountId,
          identityStatus: { not: "RESOLVED" as const },
          identityNextAttemptAt: { lte: now },
        };
        if (result.status === "found") {
          await prisma.questionAnswerEvent.updateMany({
            where,
            data: {
              respondentUserId: result.user.id,
              respondentNameSnapshot: result.user.name,
              respondentEmployeeNoSnapshot: result.user.employeeNo,
              identityStatus: "RESOLVED",
              identityCapturedAt: new Date(),
            },
          });
        } else {
          if (result.status === "temporarily_unavailable")
            partiallyUnavailable = true;
          await prisma.questionAnswerEvent.updateMany({
            where,
            data: {
              identityStatus:
                result.status === "not_found" ? "NOT_FOUND" : "PENDING",
              identityNextAttemptAt: new Date(
                now.getTime() +
                  (result.status === "not_found" ? 7 * 86400000 : 300000),
              ),
            },
          });
        }
      }
    }
    await prisma.schedulerState.update({
      where: { id: checkpoint.id },
      data: {
        lastTickAt: new Date(),
        lastErrorCode: partiallyUnavailable
          ? "DIRECTORY_PARTIALLY_UNAVAILABLE"
          : null,
        cursor: new Date(now.getTime() + 60000).toISOString(),
      },
    });
  } catch (error) {
    const directoryError =
      error instanceof DirectoryRequestError ? error : null;
    const delay = Math.max(
      directoryError?.retryAfterMs || 0,
      directoryError?.code.includes("401") ||
        directoryError?.code.includes("403")
        ? 3600000
        : 300000,
    );
    await prisma.schedulerState.update({
      where: { id: checkpoint.id },
      data: {
        lastErrorCode: directoryError?.code || "IDENTITY_ENRICHMENT_FAILED",
        cursor: new Date(
          Math.max(now.getTime(), Date.now()) + delay,
        ).toISOString(),
      },
    });
  }
}
