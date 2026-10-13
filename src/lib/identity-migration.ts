import type { Prisma } from "../generated/prisma/client";

export async function migrateUserTargets(
  tx: Prisma.TransactionClient,
  oldId: string,
  newId: string,
): Promise<void> {
  if (oldId === newId) return;
  const where = { targetType: "USER" as const, targetId: oldId };
  const data = { targetId: newId };
  // targetId is polymorphic, so PostgreSQL foreign-key cascades cannot update it.
  await tx.subscription.updateMany({ where, data });
  await tx.digestSubscription.updateMany({ where, data });
  await tx.knowledgeSubscription.updateMany({ where, data });
  await tx.pushLog.updateMany({ where, data });
  await tx.digestPushLog.updateMany({ where, data });
  await tx.knowledgePushLog.updateMany({ where, data });
  await tx.deliveryJob.updateMany({ where, data });
  await tx.questionAnswerEvent.updateMany({ where: { respondentId: oldId }, data: { respondentId: newId } });
}
