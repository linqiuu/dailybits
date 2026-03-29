import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type DepartmentItem = { name: string };
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.DEPARTMENT_API_URL?.trim();
    if (!baseUrl) {
      return NextResponse.json(MOCK_DEPARTMENTS);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { uid: true },
    });
    const userUid = user?.uid ?? "";

    const upstreamUrl = baseUrl.includes("?")
      ? `${baseUrl}&uid=${encodeURIComponent(userUid)}`
      : `${baseUrl.replace(/\/?$/, "")}?uid=${encodeURIComponent(userUid)}`;

    const res = await fetch(upstreamUrl, {
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
