export interface ContentScope {
  creatorId: string;
  visibility: "PRIVATE" | "PUBLIC" | "PARTIAL";
  visibleDepartments: string[];
}

export function canReadContent(
  bank: ContentScope,
  userId?: string,
  departmentIds: readonly string[] = [],
): boolean {
  if (bank.visibility === "PUBLIC") return true;
  if (!userId) return false;
  if (bank.creatorId === userId) return true;
  if (bank.visibility !== "PARTIAL") return false;
  const memberships = new Set(departmentIds);
  return bank.visibleDepartments.some((id) => memberships.has(id));
}

export function canManageSubscription(
  subscription: { targetType: string; targetId: string; subscriberId?: string | null },
  user: { id: string; isAdmin?: boolean } | null | undefined,
): boolean {
  if (!user) return false;
  if (subscription.targetType === "USER") return subscription.targetId === user.id;
  return user.isAdmin === true || subscription.subscriberId === user.id;
}

export function canSubscribeContent(
  bank: ContentScope,
  targetType: string,
  userId: string,
  departmentIds: readonly string[],
): boolean {
  // A group recipient must not broaden a private or department-only audience.
  return targetType === "GROUP"
    ? bank.visibility === "PUBLIC"
    : canReadContent(bank, userId, departmentIds);
}
