import { prisma } from "@/lib/prisma";
import { canReadContent } from "../content/access";

export const KNOWLEDGE_VISIBILITY_VALUES = ["PRIVATE", "PUBLIC", "PARTIAL"] as const;

export type KnowledgeVisibility = (typeof KNOWLEDGE_VISIBILITY_VALUES)[number];

export async function canAccessKnowledgeBank(
  bank: {
    creatorId: string;
    visibility: KnowledgeVisibility;
    visibleDepartments: string[];
  },
  userId?: string,
  userDepartmentKeys?: string[],
): Promise<boolean> {
  if (bank.visibility === "PUBLIC") return true;
  if (!userId) return false;
  if (bank.creatorId === userId) return true;
  if (bank.visibility !== "PARTIAL") return false;

  if (userDepartmentKeys) {
    const departmentSet = new Set(userDepartmentKeys);
    return bank.visibleDepartments.some((department) =>
      departmentSet.has(department),
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentIds: true },
  });
  return canReadContent(bank, userId, user?.departmentIds);
}
