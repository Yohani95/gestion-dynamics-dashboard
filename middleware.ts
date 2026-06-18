import { NextResponse, type NextRequest } from "next/server";
import { AUTH_SESSION_COOKIE } from "@/lib/authTypes";
import { verifySessionTokenEdge } from "@/lib/authSessionEdge";

const PUBLIC_PAGE_PATHS = new Set(["/login"]);
const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/session",
  "/api/auth/logout",
]);

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico"
  );
}

async function isAuthenticated(request: NextRequest) {
  const provider = process.env.AUTH_PROVIDER?.trim().toLowerCase();

  if (provider === "windows") {
    const username = request.headers.get("x-windows-user")?.trim();
    if (!username) return false;

    const allowedRaw = process.env.WINDOWS_ADMIN_USERS?.trim();
    if (!allowedRaw) return true;

    const allowedUsers = allowedRaw
      .split(",")
      .map((item) => normalizeUsername(item))
      .filter(Boolean);

    return allowedUsers.includes(normalizeUsername(username));
  }

  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) return false;

  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value;
  if (!token) return false;

  const session = await verifySessionTokenEdge(token, secret);
  return session !== null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const isPublicPage = PUBLIC_PAGE_PATHS.has(pathname);
  const isPublicApi = PUBLIC_API_PATHS.has(pathname);

  if (isPublicPage || isPublicApi) {
    if (pathname === "/login" && (await isAuthenticated(request))) {
      const redirectTo = request.nextUrl.searchParams.get("redirect") || "/";
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
    return NextResponse.next();
  }

  if (!(await isAuthenticated(request))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          success: false,
          error: "No autenticado. Inicia sesion para continuar.",
        },
        { status: 401 },
      );
    }

    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
