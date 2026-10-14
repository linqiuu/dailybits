import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { internalFetch } from "@/lib/http/outbound";

type DepartmentItem = { id?: string; name: string };
type DepartmentsResponse = { departments: DepartmentItem[] };

const MOCK_DEPARTMENTS: DepartmentsResponse = {
  departments: [{ name: "技术部" }, { name: "产品部" }, { name: "设计部" }],
};

function normalizeDepartmentsPayload(data: unknown): DepartmentsResponse | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const raw = (data as { departments?: unknown }).departments;
  if (!Array.isArray(raw)) {
    return null;
  }
  const departments: DepartmentItem[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const name = (item as { name?: unknown }).name;
      if (typeof name === "string" && name.trim() !== "") {
        departments.push({ name: name.trim() });
      }
    }
  }
  return { departments };
}

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.DEPARTMENT_API_URL?.trim();
    if (!baseUrl) {
      const gatewayDepartments = new Map<string, DepartmentItem>();
      for (const membership of session.user.departments) {
        for (const node of [membership.department, ...membership.path]) {
          if (!node.id && !node.name) continue;
          const key = node.id || node.name;
          gatewayDepartments.set(key, {
            id: node.id || undefined,
            name: node.name || node.id,
          });
        }
      }
      if (gatewayDepartments.size > 0) {
        return NextResponse.json({ departments: [...gatewayDepartments.values()] });
      }
      return NextResponse.json(MOCK_DEPARTMENTS);
    }

    const userUid = session.user.uid ?? "";

    const upstreamUrl = baseUrl.includes("?")
      ? `${baseUrl}&uid=${encodeURIComponent(userUid)}`
      : `${baseUrl.replace(/\/?$/, "")}?uid=${encodeURIComponent(userUid)}`;

    const res = await internalFetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[GET /api/departments] upstream", res.status, await res.text().catch(() => ""));
      return NextResponse.json(
        { error: "Failed to fetch departments from upstream" },
        { status: 502 }
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from department service" },
        { status: 502 }
      );
    }

    const normalized = normalizeDepartmentsPayload(json);
    if (!normalized) {
      return NextResponse.json(
        { error: "Unexpected department service response shape" },
        { status: 502 }
      );
    }

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("[GET /api/departments]", error);
    return NextResponse.json(
      { error: "Failed to fetch departments" },
      { status: 500 }
    );
  }
}
