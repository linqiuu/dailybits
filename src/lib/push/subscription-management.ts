import type { TargetType } from "../../types";
import { isGroupId } from "../groups/identity";

function publicBaseUrl(): URL | undefined {
  const configured = process.env.APP_PUBLIC_URL?.trim();
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error("Invalid URL");
    url.pathname = url.pathname.replace(/\/+$/, "") + "/";
    return url;
  } catch {
    throw new Error("APP_PUBLIC_URL must be an absolute HTTP(S) website URL without credentials, query or fragment");
  }
}

export function validatePublicUrlConfiguration(): void {
  publicBaseUrl();
}

export function withSubscriptionManagement<T extends { title: string }>(
  payload: T,
  targetType: TargetType,
  targetId: string,
): T & { subscriptionManageUrl?: string } {
  const base = publicBaseUrl();
  if (!base) return payload;
  if (targetType === "GROUP" && !isGroupId(targetId)) throw new Error("Invalid subscription group ID");
  const url = new URL(targetType === "GROUP" ? `group/${targetId}` : "dashboard", base);
  if (targetType === "GROUP") url.searchParams.set("tab", "digestType" in payload ? "digests" : "subscriptions");
  return { ...payload, subscriptionManageUrl: url.toString() };
}

export function formatPushTitle(payload: { title: string; subscriptionManageUrl?: string }): string {
  if (!payload.subscriptionManageUrl) return payload.title;
  const url = new URL(payload.subscriptionManageUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Invalid subscription management URL");
  const destination = url.toString().replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `${payload.title} -- [订阅管理](${destination})`;
}
