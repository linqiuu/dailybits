import { prisma } from "@/lib/prisma";
import type { TargetType } from "@/types";

export async function selectQuestion(
  targetType: TargetType,
  targetId: string,
  bankId: string,
) {
  const unpushed = await prisma.question.findFirst({
    where: {
      bankId,
      status: "PUBLISHED",
      pushLogs: { none: { targetType, targetId } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (unpushed) return unpushed;

  const count = await prisma.question.count({
    where: { bankId, status: "PUBLISHED" },
  });
  if (count === 0) return null;

  const skip = Math.floor(Math.random() * count);
  return prisma.question.findFirst({
    where: { bankId, status: "PUBLISHED" },
    skip,
  });
}
