export type AuthProvider = "local" | "windows";
export type AdminRole = "ADMIN";

export const AUTH_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const AUTH_SESSION_COOKIE = "gd_admin_session";

export type AdminSession = {
  username: string;
  role: AdminRole;
  provider: AuthProvider;
  iat: number;
  exp: number;
};
