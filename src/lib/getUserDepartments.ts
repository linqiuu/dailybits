/**
 * Extracts a department name string from a value that may be a plain string
 * or an object with a `name` field (e.g. { name: "技术部" }).
 */
function extractDeptName(item: unknown): string | null {
  if (typeof item === "string" && item.trim() !== "") return item.trim();
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const name = (item as { name?: unknown }).name;
    if (typeof name === "string" && name.trim() !== "") return name.trim();
  }
  return null;
}

/**
 * Resolves department codes for a user when DEPARTMENT_API_URL is configured.
 * Returns [] when unset, on failure, or when userUid is missing.
 *
 * Handles upstream responses in any of these shapes:
 *   - string[]                        e.g. ["技术部","产品部"]
 *   - { name: string }[]              e.g. [{ name: "技术部" }]
 *   - { departments: string[] }
 *   - { departments: { name: string }[] }
 */
export async function getUserDepartments(
  userUid: string | null | undefined
): Promise<string[]> {
  const base = process.env.DEPARTMENT_API_URL?.trim();
  if (!base || !userUid) return [];
  try {
    const url = new URL(base);
    if (!url.searchParams.has("uid")) {
      url.searchParams.set("uid", userUid);
    }
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return [];
    const json: unknown = await res.json();

    let rawItems: unknown[] | null = null;

    if (Array.isArray(json)) {
      rawItems = json;
    } else if (
      json &&
      typeof json === "object" &&
      "departments" in json &&
      Array.isArray((json as { departments: unknown }).departments)
    ) {
      rawItems = (json as { departments: unknown[] }).departments;
    }

    if (!rawItems) return [];

    const result: string[] = [];
    for (const item of rawItems) {
      const name = extractDeptName(item);
      if (name) result.push(name);
    }
    return result;
  } catch {
    return [];
  }
}
