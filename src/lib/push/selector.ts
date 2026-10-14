import { prisma } from "@/lib/prisma";
import type { TargetType } from "@/types";
import { selectLearningQuestion } from "../subscriptions/lifecycle";

export async function selectQuestion(targetType: TargetType, targetId: string, bankId: string) {
  const sub = await prisma.subscription.findUnique({ where: { targetType_targetId_bankId: { targetType, targetId, bankId } } });
  return sub ? (await selectLearningQuestion(prisma, sub))?.question ?? null : null;
}
