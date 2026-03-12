import { NextRequest, NextResponse } from "next/server";
import { getPool, query, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type DocInfo = {
  Id_Documento: string;
  Cod_Empresa: string;
  Fecha_Emision: string;
  Tipo: string;
};

export async function POST(request: NextRequest) {
  const instance = request.headers.get("x-instance") || "default";
  let body: { numero?: string; idDocumento?: string; codEmpresa?: string; fecha?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo JSON inválido. Esperado: { numero } o { idDocumento, codEmpresa, fecha }." },
      { status: 400 }
    );
  }

  const numero = body.numero?.trim();
  let idDocumento: string;
  let codEmpresa: string;
  let fecha: string;

  if (body.idDocumento && body.codEmpresa && body.fecha) {
    idDocumento = body.idDocumento;
    codEmpresa = body.codEmpresa;
    fecha = body.fecha;
  } else if (numero) {
    const sqlDoc = `
      SELECT TOP 1 Id_Documento, Cod_Empresa, CONVERT(NVARCHAR(10), Fecha_Emision, 120) AS Fecha_Emision, Tipo FROM (
        SELECT Cab.Id_Boleta AS Id_Documento, Cab.Cod_Empresa, Cab.Fecha_Emision, 'BLE' AS Tipo
        FROM Ges_BlvCabecera Cab WITH (NOLOCK)
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        UNION ALL
        SELECT Cab.Id_Factura, Cab.Cod_Empresa, Cab.Fecha_Emision, 'FCV'
        FROM Ges_FcvCabecera Cab WITH (NOLOCK)
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        UNION ALL
        SELECT Cab.Id_NotaCredito, Cab.Cod_Empresa, Cab.Fecha_Emision, 'NCV'
        FROM Ges_NcvCabecera Cab WITH (NOLOCK)
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
      ) U
      ORDER BY Fecha_Emision DESC, Tipo ASC, Id_Documento DESC
    `;
    const rows = await query<DocInfo[]>(sqlDoc, { numero }, instance);
    const doc = rows?.[0];
    if (!doc) {
      return NextResponse.json(
        { error: "Documento no encontrado.", numero },
        { status: 404 }
      );
    }
    idDocumento = doc.Id_Documento;
    codEmpresa = doc.Cod_Empresa;
    fecha = doc.Fecha_Emision;
  } else {
    return NextResponse.json(
      { error: "Indica numero o (idDocumento, codEmpresa, fecha)." },
      { status: 400 }
    );
  }

  try {
    const pool = await getPool(instance);
    const req = pool.request();
    req.input("Cod_Empresa", sql.UniqueIdentifier, codEmpresa);
    req.input("Fecha", sql.Date, new Date(fecha));
    req.input("Posicion", sql.Int, 1);
    req.input("Procesos", sql.Int, 1);
    req.input("Id_Documento", sql.UniqueIdentifier, idDocumento);
    req.output("Status", sql.Int);

    const result = await req.execute("dbo.Ges_EnviaVenta_Dyn_optimizado") as { output?: { Status?: number }; returnValue?: number };
    const status = result.output?.Status ?? result.returnValue ?? -1;

    return NextResponse.json({
      ok: status === 1,
      status,
      mensaje: status === 1 ? "Reproceso ejecutado." : `Procedimiento devolvió estado ${status}.`,
      idDocumento,
      fecha,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API reprocesar]", err.message);
    return NextResponse.json(
      { error: err.message, ok: false },
      { status: 500 }
    );
  }
}
