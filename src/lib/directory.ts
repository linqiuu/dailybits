export interface DirectoryDepartmentNode {
  id: string;
  name: string;
  level?: number | null;
  parentId?: string | null;
}

export interface DirectoryDepartmentSearchItem {
  department: DirectoryDepartmentNode;
  path: DirectoryDepartmentNode[];
}

export interface DirectoryDepartmentSearchResponse {
  items: DirectoryDepartmentSearchItem[];
}

function directoryBaseUrl(): string {
  return (
    process.env.DIRECTORY_API_BASE_URL?.trim() ||
    process.env.AUTHHUB_DIRECTORY_BASE_URL?.trim() ||
    "http://127.0.0.1:4010"
  ).replace(/\/$/, "");
}

function directoryHeaders(): HeadersInit {
  const key = process.env.DIRECTORY_INNER_API_KEY?.trim() || process.env.INNER_API_KEY?.trim();
  const headerName = process.env.DIRECTORY_INNER_API_KEY_HEADER?.trim() || "X-Inner-API-Key";
  return {
    Accept: "application/json",
    ...(key ? { [headerName]: key } : {}),
  };
}

function normalizeNode(value: unknown): DirectoryDepartmentNode | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!id || !name) return null;
  const level = typeof record.level === "number" ? record.level : null;
  const parentId = typeof record.parentId === "string" ? record.parentId : null;
  return { id, name, level, parentId };
}

export function normalizeDirectoryDepartmentSearch(
  value: unknown,
): DirectoryDepartmentSearchResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { items: [] };
  }
  const rawItems = (value as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) return { items: [] };

  const items: DirectoryDepartmentSearchItem[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const department = normalizeNode(record.department);
    if (!department) continue;
    const path = Array.isArray(record.path)
      ? record.path.map(normalizeNode).filter((node): node is DirectoryDepartmentNode => node !== null)
      : [department];
    items.push({
      department,
      path: path.length ? path : [department],
    });
  }
  return { items };
}

export async function searchDirectoryDepartments(
  query: string,
): Promise<DirectoryDepartmentSearchResponse> {
  const q = query.trim();
  if (!q) return { items: [] };
  if (q.length > 128) throw new Error("Department query exceeds 128 characters");

  const url = new URL("/directory/v1/departments/search", directoryBaseUrl());
  url.searchParams.set("q", q);
  const response = await fetch(url, {
    method: "GET",
    headers: directoryHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(
      `Directory search failed: HTTP ${response.status}`,
    );
  }

  return normalizeDirectoryDepartmentSearch(await response.json());
}
