import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type AuthProvider = "local" | "windows";
export type AdminRole = "ADMIN";

export type AdminSession = {
  username: string;
  role: AdminRole;
  provider: AuthProvider;
  iat: number;
  exp: number;
};

type LocalAdminUser = {
  username: string;
  passwordHash: string;
  role: AdminRole;
};

export const AUTH_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const AUTH_SESSION_COOKIE = "gd_admin_session";

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function getAuthProvider(): AuthProvider {
  const raw = process.env.AUTH_PROVIDER?.trim().toLowerCase();
  return raw === "windows" ? "windows" : "local";
}

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "AUTH_SESSION_SECRET no configurado. Define este valor en .env.local.",
    );
  }
  return secret;
}

function parseAdminUsersFromEnv(): LocalAdminUser[] {
  const raw = process.env.ADMIN_USERS_JSON?.trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ADMIN_USERS_JSON no tiene un JSON valido.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("ADMIN_USERS_JSON debe ser un arreglo de usuarios.");
  }

  const users: LocalAdminUser[] = [];

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

function parseWindowsAdminUsers() {
  const raw = process.env.WINDOWS_ADMIN_USERS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => normalizeUsername(item))
    .filter(Boolean);
}

function signValue(value: string) {
  const secret = getSessionSecret();
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function verifySignature(value: string, signature: string) {
  const expected = signValue(value);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function encodeSession(session: AdminSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = signValue(payload);
  return `${payload}.${signature}`;
}

function decodeSession(token: string): AdminSession | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!verifySignature(payload, signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      username?: unknown;
      role?: unknown;
      provider?: unknown;
      iat?: unknown;
      exp?: unknown;
    };

    if (
      typeof parsed.username !== "string" ||
      parsed.role !== "ADMIN" ||
      parsed.provider !== "local" ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (parsed.exp <= nowSeconds) return null;

    return {
      username: parsed.username,
      role: parsed.role,
      provider: parsed.provider,
      iat: parsed.iat,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function createLocalAdminSession(username: string): AdminSession {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    username,
    role: "ADMIN",
    provider: "local",
    iat: nowSeconds,
    exp: nowSeconds + AUTH_SESSION_TTL_SECONDS,
  };
}

export function setAdminSessionCookie(
  response: NextResponse,
  session: AdminSession,
) {
  const value = encodeSession(session);
  response.cookies.set({
    name: AUTH_SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_SESSION_TTL_SECONDS,
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
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
    exp: nowSeconds + AUTH_SESSION_TTL_SECONDS,
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
    return decodeSession(token);
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
