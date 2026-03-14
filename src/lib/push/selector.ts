import { prisma } from "@/lib/prisma";

export async function selectQuestion(userId: string, bankId: string) {
  const unpushed = await prisma.question.findFirst({
    where: {
      bankId,
      status: "PUBLISHED",
      pushLogs: { none: { userId } },
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
