import { NextResponse, NextRequest } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type EmpresaRow = { Cod_Empresa: string; Descripcion: string };

export async function GET(request: NextRequest) {
  const instance = request.headers.get("x-instance") || "default";
  try {
    const rows = await query<EmpresaRow[]>(
      "SELECT Cod_Empresa, Descripcion FROM Ges_Empresas WITH (NOLOCK) ORDER BY Descripcion",
      {},
      instance
    );
    const empresas = (rows ?? []).map((r) => ({
      codEmpresa: r.Cod_Empresa,
      descripcion: r.Descripcion ?? "",
    }));
    return NextResponse.json({ empresas });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API empresas]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
