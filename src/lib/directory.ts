import { internalFetch } from "./http/outbound";

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
    process.env.INNER_API_BASE_URL?.trim() ||
    "http://127.0.0.1:4010"
  ).replace(/\/$/, "");
}

function directoryHeaders(): HeadersInit {
  const key =
    process.env.DIRECTORY_INNER_API_KEY?.trim() ||
    process.env.INNER_API_KEY?.trim();
  const headerName =
    process.env.DIRECTORY_INNER_API_KEY_HEADER?.trim() || "X-Inner-API-Key";
  return {
    Accept: "application/json",
    ...(key ? { [headerName]: key } : {}),
  };
}

export type DirectoryIdentifier = {
  type: "uid" | "employee_no" | "email";
  value: string;
};
export interface DirectoryPerson {
  id: string;
  uid: string;
  name: string;
  employeeNo: string;
}
export type DirectoryPersonResult =
  | { input: DirectoryIdentifier; status: "found"; user: DirectoryPerson }
  | {
      input: DirectoryIdentifier;
      status: "not_found" | "temporarily_unavailable";
    };

export class DirectoryRequestError extends Error {
  constructor(
    public code: string,
    public retryAfterMs = 0,
  ) {
    super(code);
  }
}

function retryAfterMs(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

function person(value: unknown): DirectoryPerson | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    ["id", "uid", "name", "employeeNo"].some(
      (key) => typeof raw[key] !== "string" || !(raw[key] as string).trim(),
    )
  )
    return null;
  return {
    id: raw.id as string,
    uid: raw.uid as string,
    name: raw.name as string,
    employeeNo: raw.employeeNo as string,
  };
}

export async function batchResolveDirectoryPeople(
  identifiers: DirectoryIdentifier[],
): Promise<DirectoryPersonResult[]> {
  if (
    !identifiers.length ||
    identifiers.length > 100 ||
    identifiers.some((input) => !input.value.trim() || input.value.length > 320)
  )
    throw new DirectoryRequestError("INVALID_DIRECTORY_IDENTIFIERS");
  const url = new URL("/directory/v1/users/batch-resolve", directoryBaseUrl());
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await internalFetch(url, {
        method: "POST",
        headers: { ...directoryHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      if (attempt === 2)
        throw new DirectoryRequestError("DIRECTORY_UNAVAILABLE", 60000);
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      continue;
    }
    if (!response.ok) {
      const delay = Math.max(
        retryAfterMs(response.headers.get("Retry-After")),
        500 * 2 ** attempt,
      );
      if (
        ![429, 503].includes(response.status) ||
        attempt === 2 ||
        delay > 2000
      )
        throw new DirectoryRequestError(
          `DIRECTORY_HTTP_${response.status}`,
          delay,
        );
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const data = (await response.json().catch(() => null)) as {
      results?: unknown[];
    } | null;
    if (
      !Array.isArray(data?.results) ||
      data.results.length !== identifiers.length
    )
      throw new DirectoryRequestError("INVALID_DIRECTORY_RESPONSE");
    return data.results.map((item, index) => {
      if (!item || typeof item !== "object")
        throw new DirectoryRequestError("INVALID_DIRECTORY_RESPONSE");
      const row = item as Record<string, unknown>;
      const input = row.input as DirectoryIdentifier | undefined;
      if (
        input?.type !== identifiers[index].type ||
        input.value !== identifiers[index].value
      )
        throw new DirectoryRequestError("INVALID_DIRECTORY_RESPONSE");
      if (row.status === "found") {
        const user = person(row.user);
        if (!user)
          throw new DirectoryRequestError("INVALID_DIRECTORY_RESPONSE");
        return { input, status: "found", user };
      }
      if (
        row.status === "not_found" ||
        row.status === "temporarily_unavailable"
      )
        return { input, status: row.status };
      throw new DirectoryRequestError("INVALID_DIRECTORY_RESPONSE");
    });
  }
  throw new DirectoryRequestError("DIRECTORY_UNAVAILABLE", 60000);
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
      ? record.path
          .map(normalizeNode)
          .filter((node): node is DirectoryDepartmentNode => node !== null)
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
  if (q.length > 128)
    throw new Error("Department query exceeds 128 characters");

  const url = new URL("/directory/v1/departments/search", directoryBaseUrl());
  url.searchParams.set("q", q);
  const response = await internalFetch(url, {
    method: "GET",
    headers: directoryHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Directory search failed: HTTP ${response.status}`);
  }

  return normalizeDirectoryDepartmentSearch(await response.json());
}
