import { getUserDepartments } from "@/lib/getUserDepartments";
import { prisma } from "@/lib/prisma";

export const KNOWLEDGE_VISIBILITY_VALUES = ["PRIVATE", "PUBLIC", "PARTIAL"] as const;

export type KnowledgeVisibility = (typeof KNOWLEDGE_VISIBILITY_VALUES)[number];

export async function canAccessKnowledgeBank(
  bank: {
    creatorId: string;
    visibility: KnowledgeVisibility;
    visibleDepartments: string[];
  },
  userId?: string,
): Promise<boolean> {
  if (bank.visibility === "PUBLIC") return true;
  if (!userId) return false;
  if (bank.creatorId === userId) return true;
  if (bank.visibility !== "PARTIAL") return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { uid: true },
  });
  const departments = await getUserDepartments(user?.uid);
  return departments.some((department) => bank.visibleDepartments.includes(department));
}
