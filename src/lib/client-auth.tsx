"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SessionStatus = "authenticated" | "unauthenticated" | "loading" | "error";

interface ClientSessionUser {
  id: string;
  uid?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  department?: string;
  isAdmin?: boolean;
}

interface ClientSession {
  user: ClientSessionUser;
}

interface ClientAuthContextValue {
  data: ClientSession | null;
  status: SessionStatus;
  retry: () => void;
}

const ClientAuthContext = createContext<ClientAuthContextValue>({
  data: null,
  status: "loading",
  retry: () => {},
});

export function GatewaySessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [reload, setReload] = useState(0);
  const retry = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setStatus("loading");
      try {
        const response = await fetch("/api/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (cancelled) return;

        if (response.status === 401) {
          setSession(null);
          setStatus("unauthenticated");
          const lastReload = Number(window.sessionStorage.getItem("dailybits-auth-reload") || 0);
          if (Date.now() - lastReload > 60000) {
            window.sessionStorage.setItem("dailybits-auth-reload", String(Date.now()));
            window.location.reload();
          }
          return;
        }

        if (!response.ok) {
          setSession(null);
          setStatus("error");
          return;
        }

        const user = await response.json();
        if (cancelled) return;
        setSession({ user });
        setStatus("authenticated");
        window.sessionStorage.removeItem("dailybits-auth-reload");
      } catch {
        if (cancelled) return;
        setSession(null);
        setStatus("error");
      }
    }

    const timer = window.setTimeout(() => void loadSession(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reload]);

  const value = useMemo(() => ({ data: session, status, retry }), [session, status, retry]);
  return (
    <ClientAuthContext.Provider value={value}>
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useSession(): ClientAuthContextValue {
  return useContext(ClientAuthContext);
}

export function startLogin(): void {
  window.location.reload();
}

export function signOut(): void {
  window.location.href = "/__auth/logout";
}
