import type { AdminSession } from "@/lib/authTypes";

function base64UrlToString(value: string) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bufferToBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signValueEdge(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return bufferToBase64Url(signature);
}

function timingSafeEqualStrings(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function verifySessionTokenEdge(
  token: string,
  secret: string,
): Promise<AdminSession | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = await signValueEdge(payload, secret);
  if (!timingSafeEqualStrings(signature, expected)) return null;

  try {
    const parsed = JSON.parse(base64UrlToString(payload)) as {
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
      role: "ADMIN",
      provider: parsed.provider as AdminSession["provider"],
      iat: parsed.iat,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
