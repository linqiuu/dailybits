/**
 * Resolves department codes for a user when DEPARTMENT_API_URL is configured.
 * Returns [] when unset, on failure, or when userUid is missing.
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
    if (Array.isArray(json)) {
      return json.filter(
        (x): x is string => typeof x === "string" && x.trim() !== ""
      );
    }
    if (
      json &&
      typeof json === "object" &&
      "departments" in json &&
      Array.isArray((json as { departments: unknown }).departments)
    ) {
      return (json as { departments: string[] }).departments.filter(
        (x) => typeof x === "string" && x.trim() !== ""
      );
    }
    return [];
  } catch {
    return [];
  }
}
