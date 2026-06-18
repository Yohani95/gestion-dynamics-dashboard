import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import type { AdminRole, AdminSession } from "@/lib/authTypes";
import {
  AUTH_SESSION_COOKIE,
  clearAdminSessionCookie,
  createLocalAdminSession,
  decodeSessionToken,
  setAdminSessionCookie,
} from "@/lib/authSession";

export type { AdminRole, AdminSession, AuthProvider } from "@/lib/authTypes";
export { AUTH_SESSION_COOKIE, AUTH_SESSION_TTL_SECONDS } from "@/lib/authTypes";
export {
  clearAdminSessionCookie,
  createLocalAdminSession,
  setAdminSessionCookie,
} from "@/lib/authSession";

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function getAuthProvider() {
  const raw = process.env.AUTH_PROVIDER?.trim().toLowerCase();
  return raw === "windows" ? "windows" : "local";
}

function parseAdminUsersJson(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ADMIN_USERS_JSON no tiene un JSON valido.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("ADMIN_USERS_JSON debe ser un arreglo de usuarios.");
  }

  const users: Array<{
    username: string;
    passwordHash: string;
    role: AdminRole;
  }> = [];

  for (const item of parsed) {
    const record = item as {
      username?: unknown;
      passwordHash?: unknown;
      role?: unknown;
    };
    const username = typeof record.username === "string" ? record.username.trim() : "";
    const passwordHash =
      typeof record.passwordHash === "string" ? record.passwordHash.trim() : "";
    const role = record.role === "ADMIN" ? "ADMIN" : "ADMIN";

    if (!username || !passwordHash) {
      throw new Error(
        "ADMIN_USERS_JSON contiene un usuario invalido. Se requiere username y passwordHash.",
      );
    }

    users.push({
      username,
      passwordHash,
      role,
    });
  }

  return users;
}

function parseAdminUsersFromEnv() {
  const encoded = process.env.ADMIN_USERS_JSON_B64?.trim();
  if (encoded) {
    try {
      const raw = Buffer.from(encoded, "base64").toString("utf8");
      return parseAdminUsersJson(raw);
    } catch {
      throw new Error("ADMIN_USERS_JSON_B64 no tiene un base64 valido.");
    }
  }

  const raw = process.env.ADMIN_USERS_JSON?.trim();
  if (!raw) return [];

  return parseAdminUsersJson(raw);
}

function parseWindowsAdminUsers() {
  const raw = process.env.WINDOWS_ADMIN_USERS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => normalizeUsername(item))
    .filter(Boolean);
}

export async function authenticateLocalAdmin(
  username: string,
  password: string,
): Promise<{ username: string; role: AdminRole } | null> {
  const users = parseAdminUsersFromEnv();
  if (users.length === 0) {
    throw new Error(
      "ADMIN_USERS_JSON no configurado o sin usuarios. Define los administradores en .env.local.",
    );
  }

  const normalizedInput = normalizeUsername(username);
  const user = users.find((item) => normalizeUsername(item.username) === normalizedInput);
  if (!user) return null;

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) return null;

  return {
    username: user.username,
    role: user.role,
  };
}

function getWindowsSessionFromRequest(request: NextRequest): AdminSession | null {
  const username = request.headers.get("x-windows-user")?.trim();
  if (!username) return null;

  const allowedUsers = parseWindowsAdminUsers();
  if (allowedUsers.length > 0) {
    const normalized = normalizeUsername(username);
    if (!allowedUsers.includes(normalized)) return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    username,
    role: "ADMIN",
    provider: "windows",
    iat: nowSeconds,
    exp: nowSeconds + 8 * 60 * 60,
  };
}

export function getAdminSessionFromRequest(request: NextRequest): AdminSession | null {
  const provider = getAuthProvider();

  if (provider === "windows") {
    return getWindowsSessionFromRequest(request);
  }

  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    return decodeSessionToken(token);
  } catch {
    return null;
  }
}

export function toPublicSession(session: AdminSession | null) {
  if (!session) {
    return {
      authenticated: false as const,
      username: null,
      role: null,
      expiresAt: null,
      provider: getAuthProvider(),
    };
  }

  return {
    authenticated: true as const,
    username: session.username,
    role: session.role,
    expiresAt: new Date(session.exp * 1000).toISOString(),
    provider: session.provider,
  };
}
