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

type SessionPayload = {
  success?: boolean;
  authenticated?: boolean;
  username?: string | null;
  role?: string | null;
  expiresAt?: string | null;
  provider?: string;
  error?: string;
};

type AdminSessionContextValue = {
  loading: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  username: string | null;
  role: string | null;
  expiresAt: string | null;
  provider: string;
  error: string | null;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | undefined>(undefined);

function normalizeSession(payload: SessionPayload) {
  return {
    authenticated: Boolean(payload.authenticated),
    username: payload.username ?? null,
    role: payload.role ?? null,
    expiresAt: payload.expiresAt ?? null,
    provider: payload.provider ?? "local",
  };
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [provider, setProvider] = useState("local");
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: SessionPayload) => {
    const normalized = normalizeSession(payload);
    setAuthenticated(normalized.authenticated);
    setUsername(normalized.username);
    setRole(normalized.role);
    setExpiresAt(normalized.expiresAt);
    setProvider(normalized.provider);
  }, []);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          cache: "no-store",
        });

        const payload = (await response.json()) as SessionPayload;
        if (!response.ok) {
          throw new Error(payload.error ?? "No fue posible obtener la sesion.");
        }

        applyPayload(payload);
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Error inesperado al consultar sesion.";
        setError(message);
        setAuthenticated(false);
        setUsername(null);
        setRole(null);
        setExpiresAt(null);
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [applyPayload],
  );

  const login = useCallback(
    async (user: string, password: string) => {
      setError(null);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: user, password }),
      });

      const payload = (await response.json()) as SessionPayload;
      if (!response.ok || !payload.authenticated) {
        const message = payload.error ?? "No fue posible iniciar sesion.";
        setError(message);
        return {
          success: false,
          error: message,
        };
      }

      applyPayload(payload);
      setLoading(false);
      return { success: true };
    },
    [applyPayload],
  );

  const logout = useCallback(async () => {
    setError(null);
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    setAuthenticated(false);
    setUsername(null);
    setRole(null);
    setExpiresAt(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AdminSessionContextValue>(
    () => ({
      loading,
      authenticated,
      isAdmin: authenticated && role === "ADMIN",
      username,
      role,
      expiresAt,
      provider,
      error,
      refresh,
      login,
      logout,
    }),
    [
      authenticated,
      error,
      expiresAt,
      loading,
      login,
      logout,
      provider,
      refresh,
      role,
      username,
    ],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const context = useContext(AdminSessionContext);
  if (!context) {
    throw new Error("useAdminSession debe usarse dentro de AdminSessionProvider");
  }
  return context;
}

