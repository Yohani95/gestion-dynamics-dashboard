import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type LineaRow = {
  Nro_Linea: number;
  Id_Detalle: string;
  Tipo_Movimiento: string | null;
  Estado: number | null;
  Fecha: string | null;
  Id_Documento_Dynamics: string | null;
};

export async function GET(request: NextRequest) {
  const instance = request.headers.get("x-instance") || "default";
  const idDocumento = request.nextUrl.searchParams.get("idDocumento")?.trim();
  const tipo = request.nextUrl.searchParams.get("tipo")?.trim()?.toUpperCase();

  if (!idDocumento || !tipo || !["BLE", "FCV", "NCV"].includes(tipo)) {
    return NextResponse.json(
      { error: "Faltan idDocumento y tipo (BLE, FCV o NCV)." },
      { status: 400 }
    );
  }

  try {
    let sqlLineas = "";
    if (tipo === "BLE") {
      sqlLineas = `
        SELECT Det.Nro_Linea, Det.Id_DetalleBoleta AS Id_Detalle, Det.Tipo_Movimiento,
               E.Estado, E.Fecha, E.Id_Documento_Dynamics
        FROM Ges_BlvDetalle Det WITH (NOLOCK)
        LEFT JOIN Ges_EstadoEnvioDynamics E WITH (NOLOCK)
          ON E.Id_Documento = Det.Id_Boleta AND E.Id_Documento_Detalle = Det.Id_DetalleBoleta
        WHERE Det.Id_Boleta = CAST(@idDocumento AS UNIQUEIDENTIFIER)
        ORDER BY Det.Nro_Linea
      `;
    } else if (tipo === "FCV") {
      sqlLineas = `
        SELECT Det.Nro_Linea, Det.Id_DetalleFactura AS Id_Detalle, CAST('' AS NVARCHAR(20)) AS Tipo_Movimiento,
               E.Estado, E.Fecha, E.Id_Documento_Dynamics
        FROM Ges_FcvDetalle Det WITH (NOLOCK)
        LEFT JOIN Ges_EstadoEnvioDynamics E WITH (NOLOCK)
          ON E.Id_Documento = Det.Id_Factura AND E.Id_Documento_Detalle = Det.Id_DetalleFactura
        WHERE Det.Id_Factura = CAST(@idDocumento AS UNIQUEIDENTIFIER)
        ORDER BY Det.Nro_Linea
      `;
    } else {
      sqlLineas = `
        SELECT Det.Nro_Linea, Det.Id_DetalleNotaCredito AS Id_Detalle, CAST('' AS NVARCHAR(20)) AS Tipo_Movimiento,
               E.Estado, E.Fecha, E.Id_Documento_Dynamics
        FROM Ges_NcvDetalle Det WITH (NOLOCK)
        LEFT JOIN Ges_EstadoEnvioDynamics E WITH (NOLOCK)
          ON E.Id_Documento = Det.Id_NotaCredito AND E.Id_Documento_Detalle = Det.Id_DetalleNotaCredito
        WHERE Det.Id_NotaCredito = CAST(@idDocumento AS UNIQUEIDENTIFIER)
        ORDER BY Det.Nro_Linea
      `;
    }

    const rows = await query<LineaRow[]>(sqlLineas, { idDocumento }, instance);

    const lineas = (rows ?? []).map((r) => ({
      nroLinea: r.Nro_Linea,
      idDetalle: r.Id_Detalle,
      tipoMovimiento: r.Tipo_Movimiento ?? "—",
      estado: r.Estado,
      fecha: r.Fecha,
      idDocumentoDynamics: r.Id_Documento_Dynamics,
    }));

    return NextResponse.json({ tipo, idDocumento, lineas });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API documento/lineas]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
