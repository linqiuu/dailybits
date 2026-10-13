import { headers } from "next/headers";
import { cache } from "react";
import { migrateUserTargets } from "./identity-migration";
import { canReadContent, type ContentScope } from "./content/access";
import {
  GatewayIdentityError,
  parseGatewayUserFromHeaders,
  type GatewayUser,
} from "./gateway-auth";
import { prisma } from "./prisma";

type AuthMode = "gateway" | "dev";

export interface AppSessionUser {
  id: string;
  uid?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  employeeNumber?: string;
  employeeType?: string;
  department?: string;
  departmentIds: string[];
  departmentNames: string[];
  departments: GatewayUser["departments"];
  isAdmin: boolean;
}

export interface AppSession {
  user: AppSessionUser;
}

const authMode = normalizeAuthMode(process.env.AUTH_MODE);

if (authMode === "dev" && isProductionRuntime()) {
  throw new Error("AUTH_MODE=dev is not allowed in production");
}

function normalizeAuthMode(value: string | undefined): AuthMode {
  if (!value) return "gateway";
  const normalized = value.trim().toLowerCase();
  if (normalized === "dev") return "dev";
  if (normalized === "gateway") return "gateway";
  throw new Error(`Unsupported AUTH_MODE: ${value}`);
}

function isProductionRuntime(): boolean {
  return (
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function envString(name: string, fallback = ""): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function adminUserIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isAdminUser(userId: string): boolean {
  const ids = adminUserIds();
  if (ids.size === 0) return authMode === "dev";
  return ids.has(userId);
}

function devGatewayUser(): GatewayUser {
  const id = envString("DEV_USER_ID", "local-admin");
  const uid = envString("DEV_USER_UID", id);
  const department = envString("DEV_USER_DEPARTMENT", "本地开发");
  const displayName = envString("DEV_USER_NAME", "Local Admin");
  return {
    id,
    uid,
    employeeNumber: envString("DEV_USER_EMPLOYEE_NUMBER"),
    employeeType: envString("DEV_USER_EMPLOYEE_TYPE", "employee"),
    department,
    email: envString("DEV_USER_EMAIL"),
    displayName,
    avatarUrl: envString("DEV_USER_AVATAR_URL"),
    chineseName: "",
    englishName: "",
    authSubjectId: "",
    jobLevel: "",
    departments: department
      ? [
          {
            department: { id: "", name: department },
            isPrimary: true,
            path: [],
          },
        ]
      : [],
    sourceUpdatedAt: "",
    identitySource: "dev",
    departmentIds: [],
    departmentNames: department ? [department] : [],
  };
}

async function getCurrentGatewayUser(): Promise<GatewayUser | null> {
  if (authMode === "dev") {
    return devGatewayUser();
  }

  const requestHeaders = await headers();
  return parseGatewayUserFromHeaders(requestHeaders);
}

function nullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function syncGatewayUser(gatewayUser: GatewayUser) {
  const uid = nullableString(gatewayUser.uid);
  const email = nullableString(gatewayUser.email);
  const displayName = nullableString(gatewayUser.displayName);
  const image = nullableString(gatewayUser.avatarUrl);

  return prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dailybits:identity:${uid || email || gatewayUser.id}`}))`;
  const [byId, byUid, byEmail] = await Promise.all([
    tx.user.findUnique({ where: { id: gatewayUser.id } }),
    uid ? tx.user.findUnique({ where: { uid } }) : null,
    email ? tx.user.findUnique({ where: { email } }) : null,
  ]);
  const owners = new Set([byId, byUid, byEmail].filter(Boolean).map((user) => user!.id));
  if (owners.size > 1) throw new Error("IDENTITY_MIGRATION_CONFLICT");
  if (byId) {
    return tx.user.update({
      where: { id: gatewayUser.id },
      data: { uid, email, name: displayName, image, departmentIds: gatewayUser.departmentIds },
    });
  }

  const legacy = byUid ?? byEmail;

  if (legacy) {
    await migrateUserTargets(tx, legacy.id, gatewayUser.id);
    return tx.user.update({
      where: { id: legacy.id },
      data: {
        id: gatewayUser.id,
        uid,
        email,
        name: displayName,
        image,
        departmentIds: gatewayUser.departmentIds,
      },
    });
  }

  return tx.user.create({
    data: {
      id: gatewayUser.id,
      uid,
      email,
      name: displayName,
      image,
      departmentIds: gatewayUser.departmentIds,
    },
  });
  });
}

function buildSessionUser(gatewayUser: GatewayUser): AppSessionUser {
  return {
    id: gatewayUser.id,
    uid: gatewayUser.uid || null,
    name: gatewayUser.displayName || gatewayUser.uid || gatewayUser.id,
    email: gatewayUser.email || null,
    image: gatewayUser.avatarUrl || null,
    employeeNumber: gatewayUser.employeeNumber,
    employeeType: gatewayUser.employeeType,
    department: gatewayUser.department,
    departments: gatewayUser.departments,
    departmentIds: gatewayUser.departmentIds,
    departmentNames: gatewayUser.departmentNames,
    isAdmin: isAdminUser(gatewayUser.id),
  };
}

export function isAdminSession(session: AppSession | null | undefined): boolean {
  return !!session?.user?.id && session.user.isAdmin;
}

export const getCurrentSession = cache(async (): Promise<AppSession | null> => {
  try {
    const gatewayUser = await getCurrentGatewayUser();
    if (!gatewayUser) return null;
    await syncGatewayUser(gatewayUser);
    return { user: buildSessionUser(gatewayUser) };
  } catch (error) {
    if (error instanceof GatewayIdentityError) {
      return null;
    }
    throw error;
  }
});

export async function getSessionDepartmentKeys(
  session: AppSession | null | undefined,
): Promise<string[]> {
  if (!session?.user?.id) return [];

  return [...new Set(session.user.departmentIds.filter(Boolean))];
}

export function canAccessBank(bank: ContentScope, session: AppSession | null): boolean {
  return canReadContent(bank, session?.user.id, session?.user.departmentIds);
}
