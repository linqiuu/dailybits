import { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import type { OAuthConfig } from "next-auth/providers/oauth";
import GithubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

type CustomOAuthProfile = Record<string, unknown>;
type CustomOAuthTokens = {
  expires_at?: unknown;
  expires_in?: unknown;
};

type CustomOAuthRequestContext = {
  tokens: {
    access_token?: string | null;
  };
  provider: {
    clientId?: string;
  };
};

const CUSTOM_OAUTH_PROVIDER_ID = "custom-oauth";
const CUSTOM_OAUTH_SCOPE = process.env.CUSTOM_OAUTH_SCOPE ?? "";

function normalizeTokenTimestamps(tokens: CustomOAuthTokens) {
  const expiresAt = Number(tokens.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt > 2147483647) {
    tokens.expires_at = Math.floor(expiresAt / 1000);
  }

  const expiresIn = Number(tokens.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 2147483647) {
    tokens.expires_in = Math.floor(expiresIn / 1000);
  }
}

function pickString(profile: CustomOAuthProfile, keys: string[]): string | null {
  for (const key of keys) {
    const value = profile[key];
    if (value == null) {
      continue;
    }
    const normalized = String(value).trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function mapCustomOAuthProfile(profile: CustomOAuthProfile): {
  id: string;
  uid: string | null;
  name: string;
  email: string;
} {
  // TODO(internal): 替换成你们内网 SSO 的字段映射逻辑。
  // 例如：id <- profile.globalUserID, uid <- profile.uid, name <- profile.displayName
  const id = pickString(profile, ["id", "sub", "userId"]);
  if (!id) {
    throw new Error("Custom OAuth profile missing id; please replace mapCustomOAuthProfile()");
  }

  return {
    id,
    uid: pickString(profile, ["uid"]),
    name: pickString(profile, ["name"]) ?? "OAuth User",
    email: pickString(profile, ["email"]) ?? `${id}@oauth.local`,
  };
}

function extractUid(profile: unknown): string | null {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return null;
  }
  try {
    return mapCustomOAuthProfile(profile as CustomOAuthProfile).uid;
  } catch {
    return null;
  }
}

const customOAuthProvider: OAuthConfig<CustomOAuthProfile> | null = process.env.CUSTOM_OAUTH_CLIENT_ID
  ? {
      id: CUSTOM_OAUTH_PROVIDER_ID,
      name: "登录",
      type: "oauth",
      clientId: process.env.CUSTOM_OAUTH_CLIENT_ID,
      clientSecret: process.env.CUSTOM_OAUTH_CLIENT_SECRET,
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
      authorization: {
        url: process.env.CUSTOM_OAUTH_AUTH_URL,
        params: {
          response_type: "code",
          ...(CUSTOM_OAUTH_SCOPE ? { scope: CUSTOM_OAUTH_SCOPE } : {}),
        },
      },
      token: process.env.CUSTOM_OAUTH_TOKEN_URL,
      userinfo: {
        url: process.env.CUSTOM_OAUTH_USERINFO_URL,
        async request(context: CustomOAuthRequestContext) {
          const token = context.tokens.access_token;
          const clientId = context.provider.clientId;
          const url = new URL(process.env.CUSTOM_OAUTH_USERINFO_URL!);
          if (token) url.searchParams.append("access_token", String(token));
          if (clientId) url.searchParams.append("client_id", String(clientId));
          if (CUSTOM_OAUTH_SCOPE) url.searchParams.append("scope", CUSTOM_OAUTH_SCOPE);

          const res = await fetch(url.toString());
          if (!res.ok) {
            throw new Error(`Custom OAuth userinfo request failed: ${res.status}`);
          }
          return res.json();
        },
      },
      profile(profile: CustomOAuthProfile, tokens: CustomOAuthTokens) {
        normalizeTokenTimestamps(tokens);
        const mapped = mapCustomOAuthProfile(profile);

        return {
          id: mapped.id,
          name: mapped.name,
          email: mapped.email,
          uid: mapped.uid,
        };
      },
    }
  : null;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    ...(customOAuthProvider ? [customOAuthProvider] : []),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== CUSTOM_OAUTH_PROVIDER_ID || !user?.id) {
        return;
      }
      const uid = extractUid(profile);
      if (!uid) {
        return;
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { uid },
      });
    },
  },
  pages: {
    signIn: "/login",
  },
  debug: process.env.NODE_ENV !== "production",
};
