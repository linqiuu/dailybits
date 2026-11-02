export const MAX_GROUP_ID_LENGTH = 255;

export function isGroupId(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_GROUP_ID_LENGTH && /^\d+$/.test(value);
}

export function normalizeGroupId(value: string): string | null {
  const groupId = value.trim();
  return isGroupId(groupId) ? groupId : null;
}
