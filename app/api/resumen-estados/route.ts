import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type ResumenRow = {
  Descripcion: string;
  Fecha: string;
  Cod_Empresa: string;
  Tipo: string;
  Estado: number;
  Cantidad: number;
};

const ESTADOS_VALIDOS = [0, 1, 2, 3, 4];

export async function GET(request: NextRequest) {
  const instance = request.headers.get("x-instance") || "default";
  let fechaDesde = request.nextUrl.searchParams.get("fechaDesde")?.trim() ?? "";
  const fechaHastaParam = request.nextUrl.searchParams.get("fechaHasta")?.trim() ?? "";

  // Asegurar YYYY-MM-DD: si ya viene en ese formato se usa tal cual (evita cambios por zona horaria)
  if (fechaDesde && !/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde)) {
    const d = new Date(fechaDesde + "T12:00:00");
    if (!Number.isNaN(d.getTime())) {
      fechaDesde = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
  }
  if (!fechaDesde || !/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde)) {
    return NextResponse.json(
      { error: "Falta o formato incorrecto: fechaDesde (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  let fechaHasta = "";
  if (fechaHastaParam) {
    const d = new Date(fechaHastaParam + "T12:00:00");
    if (!Number.isNaN(d.getTime())) {
      fechaHasta = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
  }
  if (fechaHasta && !/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta)) fechaHasta = "";

  const estadosParam = request.nextUrl.searchParams.get("estados")?.trim() ?? "";
  const estadosList = estadosParam
    ? estadosParam.split(",").map((e) => parseInt(e.trim(), 10)).filter((n) => !Number.isNaN(n) && ESTADOS_VALIDOS.includes(n))
    : ESTADOS_VALIDOS;
  const estadosUnicos = [...new Set(estadosList)];
  if (estadosUnicos.length === 0) {
    return NextResponse.json(
      { error: "Indica al menos un estado (0-4)." },
      { status: 400 }
    );
  }
  const estadosStr = estadosUnicos.join(",");

  const empresa = request.nextUrl.searchParams.get("empresa")?.trim() ?? "";

  try {
    const filtroHasta =
      "AND (NULLIF(RTRIM(@fechaHasta), '') IS NULL OR CONVERT(DATE, Cab.Fecha_Emision) <= CAST(@fechaHasta AS DATE))";
    const sqlResumen = `
      WITH EstDyn AS (
        SELECT Id_Documento, MIN(Estado) AS Estado
        FROM Ges_EstadoEnvioDynamics WITH (NOLOCK)
        GROUP BY Id_Documento
      )
      SELECT Descripcion, Fecha, Cod_Empresa, Tipo, Estado, Cantidad FROM (
        SELECT emp.Descripcion,
               CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23) AS Fecha,
               Cab.Cod_Empresa,
               'BLE' AS Tipo,
               ISNULL(L.Estado, 0) AS Estado,
               COUNT(*) AS Cantidad
        FROM Ges_BlvCabecera Cab WITH (NOLOCK)
        INNER JOIN Ges_Empresas Emp WITH (NOLOCK) ON Emp.Cod_Empresa = Cab.Cod_Empresa
        LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_Boleta
        WHERE CONVERT(DATE, Cab.Fecha_Emision) >= CAST(@fechaDesde AS DATE)
          ${filtroHasta}
          AND (NULLIF(RTRIM(@empresa), '') IS NULL OR Cab.Cod_Empresa = CAST(NULLIF(RTRIM(@empresa), '') AS UNIQUEIDENTIFIER))
          AND CHARINDEX(',' + CAST(ISNULL(L.Estado, 0) AS VARCHAR(5)) + ',', ',' + @estados + ',') > 0
        GROUP BY ISNULL(L.Estado, 0),
                 emp.Descripcion,
                 CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23),
                 Cab.Cod_Empresa
        UNION ALL
        SELECT emp.Descripcion,
               CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23) AS Fecha,
               Cab.Cod_Empresa,
               'FCV' AS Tipo,
               ISNULL(L.Estado, 0) AS Estado,
               COUNT(*) AS Cantidad
        FROM Ges_FcvCabecera Cab WITH (NOLOCK)
        INNER JOIN Ges_Empresas Emp WITH (NOLOCK) ON Emp.Cod_Empresa = Cab.Cod_Empresa
        LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_Factura
        WHERE CONVERT(DATE, Cab.Fecha_Emision) >= CAST(@fechaDesde AS DATE)
          ${filtroHasta}
          AND (NULLIF(RTRIM(@empresa), '') IS NULL OR Cab.Cod_Empresa = CAST(NULLIF(RTRIM(@empresa), '') AS UNIQUEIDENTIFIER))
          AND CHARINDEX(',' + CAST(ISNULL(L.Estado, 0) AS VARCHAR(5)) + ',', ',' + @estados + ',') > 0
        GROUP BY ISNULL(L.Estado, 0),
                 emp.Descripcion,
                 CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23),
                 Cab.Cod_Empresa
        UNION ALL
        SELECT emp.Descripcion,
               CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23) AS Fecha,
               Cab.Cod_Empresa,
               'NCV' AS Tipo,
               ISNULL(L.Estado, 0) AS Estado,
               COUNT(*) AS Cantidad
        FROM Ges_NcvCabecera Cab WITH (NOLOCK)
        INNER JOIN Ges_Empresas Emp WITH (NOLOCK) ON Emp.Cod_Empresa = Cab.Cod_Empresa
        LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_NotaCredito
        WHERE CONVERT(DATE, Cab.Fecha_Emision) >= CAST(@fechaDesde AS DATE)
          ${filtroHasta}
          AND (NULLIF(RTRIM(@empresa), '') IS NULL OR Cab.Cod_Empresa = CAST(NULLIF(RTRIM(@empresa), '') AS UNIQUEIDENTIFIER))
          AND CHARINDEX(',' + CAST(ISNULL(L.Estado, 0) AS VARCHAR(5)) + ',', ',' + @estados + ',') > 0
        GROUP BY ISNULL(L.Estado, 0),
                 emp.Descripcion,
                 CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23),
                 Cab.Cod_Empresa
      ) U
      ORDER BY Descripcion, Fecha, Tipo, Estado
    `;

    const rows = await query<ResumenRow[]>(sqlResumen, {
      fechaDesde,
      fechaHasta: fechaHasta || "",
      estados: estadosStr,
      empresa,
    }, instance);

    const resumen = (rows ?? []).map((r) => ({
      descripcion: r.Descripcion,
      fecha: r.Fecha,
      codEmpresa: r.Cod_Empresa,
      tipo: r.Tipo,
      estado: r.Estado,
      cantidad: r.Cantidad,
    }));

    return NextResponse.json({
      fechaDesde,
      fechaHasta: fechaHasta || null,
      estados: estadosUnicos,
      resumen,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API resumen-estados]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
