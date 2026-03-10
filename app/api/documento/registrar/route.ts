import { NextRequest, NextResponse } from "next/server";
import { getPool, query, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type DocInfo = { Cod_Empresa: string; Fecha_Emision: string };

export async function POST(request: NextRequest) {
  let body: { numero?: string; codEmpresa?: string; fecha?: string; documento?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo JSON inválido. Esperado: { codEmpresa, fecha [, documento] } o { numero }." },
      { status: 400 }
    );
  }

  let codEmpresa: string;
  let fecha: string;
  let documento: string | null = body.documento?.trim() || null;

  if (body.codEmpresa && body.fecha) {
    codEmpresa = body.codEmpresa;
    fecha = body.fecha;
  } else if (body.numero?.trim()) {
    const n = body.numero.trim();
    const sqlDoc = `
      SELECT TOP 1 Cab.Cod_Empresa, CONVERT(NVARCHAR(10), Cab.Fecha_Emision, 120) AS Fecha_Emision
      FROM Ges_BlvCabecera Cab WITH (NOLOCK)
      WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
      UNION ALL
      SELECT Cab.Cod_Empresa, CONVERT(NVARCHAR(10), Cab.Fecha_Emision, 120)
      FROM Ges_FcvCabecera Cab WITH (NOLOCK)
      WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
      UNION ALL
      SELECT Cab.Cod_Empresa, CONVERT(NVARCHAR(10), Cab.Fecha_Emision, 120)
      FROM Ges_NcvCabecera Cab WITH (NOLOCK)
      WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
    `;
    const rows = await query<DocInfo[]>(sqlDoc, { numero: n });
    const doc = rows?.[0];
    if (!doc) {
      return NextResponse.json(
        { error: "Documento no encontrado.", numero: n },
        { status: 404 }
      );
    }
    codEmpresa = doc.Cod_Empresa;
    fecha = doc.Fecha_Emision;
    documento = n;
  } else {
    return NextResponse.json(
      { error: "Indica codEmpresa y fecha, o numero." },
      { status: 400 }
    );
  }

  try {
    const pool = await getPool();
    const req = pool.request();
    req.input("Cod_Empresa", sql.UniqueIdentifier, codEmpresa);
    req.input("Fecha", sql.Date, new Date(fecha));
    req.input("Posicion", sql.Int, 1);
    req.input("Procesos", sql.Int, 1);
    req.input("Documento", sql.VarChar(20), documento ?? "");

    await req.execute("dbo.Ges_Registra_Venta__Dyn_optimizado");

    return NextResponse.json({
      ok: true,
      mensaje: "Registro ejecutado.",
      codEmpresa,
      fecha,
      documento: documento ?? null,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API registrar]", err.message);
    return NextResponse.json(
      { error: err.message, ok: false },
      { status: 500 }
    );
  }
}
