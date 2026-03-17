import { NextRequest, NextResponse } from "next/server";
import {
  authenticateLocalAdmin,
  createLocalAdminSession,
  getAuthProvider,
  setAdminSessionCookie,
  toPublicSession,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const provider = getAuthProvider();

  if (provider === "windows") {
    return NextResponse.json(
      {
        success: false,
        error:
          "AUTH_PROVIDER=windows no habilita login por formulario. Usa autenticacion integrada de IIS/AD.",
      },
      { status: 400 },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON invalido. Esperado: { username, password }" },
      { status: 400 },
    );
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { success: false, error: "Usuario y clave son obligatorios." },
      { status: 400 },
    );
  }

  try {
    const user = await authenticateLocalAdmin(username, password);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Credenciales invalidas." },
        { status: 401 },
      );
    }

    const session = createLocalAdminSession(user.username);
    const response = NextResponse.json({
      success: true,
      ...toPublicSession(session),
    });
    setAdminSessionCookie(response, session);
    return response;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[API auth/login]", err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

