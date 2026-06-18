import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import type { AdminSession } from "@/lib/authTypes";
import { AUTH_SESSION_COOKIE, AUTH_SESSION_TTL_SECONDS } from "@/lib/authTypes";

export { AUTH_SESSION_COOKIE, AUTH_SESSION_TTL_SECONDS } from "@/lib/authTypes";

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "AUTH_SESSION_SECRET no configurado. Define este valor en .env.local.",
    );
  }
  return secret;
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

export function decodeSessionToken(token: string): AdminSession | null {
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
      (parsed.provider !== "local" && parsed.provider !== "windows") ||
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
      provider: parsed.provider as AdminSession["provider"],
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
