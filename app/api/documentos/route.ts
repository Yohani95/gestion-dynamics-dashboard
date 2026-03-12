import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type DocListItem = {
  Tipo: string;
  Numero: number;
  Id_Documento: string;
  Cod_Empresa: string;
  Fecha_Emision: string;
  Estado_SII: number | null;
  Estado_Envio: number | null;
  Lineas_Gestion: number;
  Lineas_Dynamics_OK: number;
  Total: number;
};

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

export async function GET(request: NextRequest) {
  const instance = request.headers.get("x-instance") || "default";
  const fecha = request.nextUrl.searchParams.get("fecha")?.trim();
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json(
      { error: "Falta o formato incorrecto: fecha (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const empresa = request.nextUrl.searchParams.get("empresa")?.trim() ?? "";
  const tipo = request.nextUrl.searchParams.get("tipo")?.trim().toUpperCase() ?? "";
  const numero = request.nextUrl.searchParams.get("numero")?.trim() ?? "";
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  const tipoCol = request.nextUrl.searchParams.get("tipoCol")?.trim().toUpperCase() ?? "";
  const sii = request.nextUrl.searchParams.get("sii")?.trim() ?? "";
  const dynamics = request.nextUrl.searchParams.get("dynamics")?.trim() ?? "";
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("pageSize") ?? String(PAGE_SIZE_DEFAULT), 10) || PAGE_SIZE_DEFAULT)
  );

  try {
    // Un documento = una fila: Estado_Envio viene de MIN(Estado) por Id_Documento
    const sqlList = `
      WITH EstDyn AS (
        SELECT Id_Documento, MIN(Estado) AS Estado
        FROM Ges_EstadoEnvioDynamics WITH (NOLOCK)
        GROUP BY Id_Documento
      ),
      SiiDoc AS (
        SELECT Id_Documento, MAX(Estado) AS Estado
        FROM Ges_EleDocSii WITH (NOLOCK)
        GROUP BY Id_Documento
      ),
      U AS (
        SELECT 'BLE' AS Tipo, Cab.Nro_Impreso AS Numero, Cab.Id_Boleta AS Id_Documento, Cab.Cod_Empresa, 
               CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23) AS Fecha_Emision,
                Sii.Estado AS Estado_SII, L.Estado AS Estado_Envio,
                ISNULL(Det.Cnt, 0) AS Lineas_Gestion,
                ISNULL(DetSync.Cnt, 0) AS Lineas_Dynamics_OK
        FROM Ges_BlvCabecera Cab WITH (NOLOCK)
        LEFT JOIN (
          SELECT Id_Boleta, COUNT(*) AS Cnt
          FROM Ges_BlvDetalle WITH (NOLOCK)
          WHERE UPPER(LTRIM(RTRIM(ISNULL(Tipo_Movimiento, '')))) <> 'C'
          GROUP BY Id_Boleta
        ) Det ON Det.Id_Boleta = Cab.Id_Boleta
        LEFT JOIN (
          SELECT D.Id_Boleta, COUNT(*) AS Cnt
          FROM Ges_BlvDetalle D WITH (NOLOCK)
          WHERE UPPER(LTRIM(RTRIM(ISNULL(D.Tipo_Movimiento, '')))) <> 'C'
            AND EXISTS (
              SELECT 1
              FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
              WHERE E.Id_Documento = D.Id_Boleta
                AND E.Id_Documento_Detalle = D.Id_DetalleBoleta
                AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
            )
          GROUP BY D.Id_Boleta
        ) DetSync ON DetSync.Id_Boleta = Cab.Id_Boleta
        LEFT JOIN SiiDoc Sii ON Sii.Id_Documento = Cab.Id_Boleta
        LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_Boleta
        WHERE CONVERT(DATE, Cab.Fecha_Emision) = CAST(@fecha AS DATE)
          AND (NULLIF(RTRIM(@empresa), '') IS NULL OR Cab.Cod_Empresa = CAST(NULLIF(RTRIM(@empresa), '') AS UNIQUEIDENTIFIER))
          AND (NULLIF(RTRIM(@numero), '') IS NULL OR Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) LIKE '%' + @numero + '%')
        UNION ALL
        SELECT 'FCV', Cab.Nro_Impreso, Cab.Id_Factura, Cab.Cod_Empresa, CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23), Sii.Estado, L.Estado, ISNULL(Det.Cnt, 0), ISNULL(DetSync.Cnt, 0)
        FROM Ges_FcvCabecera Cab WITH (NOLOCK)
        LEFT JOIN (SELECT Id_Factura, COUNT(*) AS Cnt FROM Ges_FcvDetalle WITH (NOLOCK) GROUP BY Id_Factura) Det ON Det.Id_Factura = Cab.Id_Factura
        LEFT JOIN (
          SELECT D.Id_Factura, COUNT(*) AS Cnt
          FROM Ges_FcvDetalle D WITH (NOLOCK)
          WHERE EXISTS (
            SELECT 1
            FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
            WHERE E.Id_Documento = D.Id_Factura
              AND E.Id_Documento_Detalle = D.Id_DetalleFactura
              AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
          )
          GROUP BY D.Id_Factura
        ) DetSync ON DetSync.Id_Factura = Cab.Id_Factura
        LEFT JOIN SiiDoc Sii ON Sii.Id_Documento = Cab.Id_Factura
        LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_Factura
        WHERE CONVERT(DATE, Cab.Fecha_Emision) = CAST(@fecha AS DATE)
          AND (NULLIF(RTRIM(@empresa), '') IS NULL OR Cab.Cod_Empresa = CAST(NULLIF(RTRIM(@empresa), '') AS UNIQUEIDENTIFIER))
          AND (NULLIF(RTRIM(@numero), '') IS NULL OR Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) LIKE '%' + @numero + '%')
        UNION ALL
        SELECT 'NCV', Cab.Nro_Impreso, Cab.Id_NotaCredito, Cab.Cod_Empresa, CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23), Sii.Estado, L.Estado, ISNULL(Det.Cnt, 0), ISNULL(DetSync.Cnt, 0)
        FROM Ges_NcvCabecera Cab WITH (NOLOCK)
        LEFT JOIN (SELECT Id_NotaCredito, COUNT(*) AS Cnt FROM Ges_NcvDetalle WITH (NOLOCK) GROUP BY Id_NotaCredito) Det ON Det.Id_NotaCredito = Cab.Id_NotaCredito
        LEFT JOIN (
          SELECT D.Id_NotaCredito, COUNT(*) AS Cnt
          FROM Ges_NcvDetalle D WITH (NOLOCK)
          WHERE EXISTS (
            SELECT 1
            FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
            WHERE E.Id_Documento = D.Id_NotaCredito
              AND E.Id_Documento_Detalle = D.Id_DetalleNotaCredito
              AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
          )
          GROUP BY D.Id_NotaCredito
        ) DetSync ON DetSync.Id_NotaCredito = Cab.Id_NotaCredito
        LEFT JOIN SiiDoc Sii ON Sii.Id_Documento = Cab.Id_NotaCredito
        LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_NotaCredito
        WHERE CONVERT(DATE, Cab.Fecha_Emision) = CAST(@fecha AS DATE)
          AND (NULLIF(RTRIM(@empresa), '') IS NULL OR Cab.Cod_Empresa = CAST(NULLIF(RTRIM(@empresa), '') AS UNIQUEIDENTIFIER))
          AND (NULLIF(RTRIM(@numero), '') IS NULL OR Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) LIKE '%' + @numero + '%')
      ),
      U2 AS (
        SELECT Tipo, Numero, Id_Documento, Cod_Empresa, Fecha_Emision, Estado_SII, Estado_Envio, Lineas_Gestion, Lineas_Dynamics_OK,
               COUNT(*) OVER() AS Total
        FROM U
        WHERE (NULLIF(RTRIM(@tipo), '') IS NULL OR Tipo = RTRIM(@tipo))
          AND (NULLIF(RTRIM(@tipoCol), '') IS NULL OR Tipo = RTRIM(@tipoCol))
          AND (
            NULLIF(RTRIM(@search), '') IS NULL
            OR CONVERT(NVARCHAR(20), Numero) LIKE '%' + RTRIM(@search) + '%'
            OR Tipo LIKE '%' + RTRIM(@search) + '%'
          )
          AND (
            NULLIF(RTRIM(@sii), '') IS NULL
            OR ISNULL(Estado_SII, -1) = TRY_CAST(@sii AS INT)
          )
          AND (
            NULLIF(RTRIM(@dynamics), '') IS NULL
            OR (TRY_CAST(@dynamics AS INT) = 0 AND (Estado_Envio IS NULL OR Estado_Envio = 0))
            OR (TRY_CAST(@dynamics AS INT) <> 0 AND Estado_Envio = TRY_CAST(@dynamics AS INT))
          )
      )
      SELECT Tipo, Numero, Id_Documento, Cod_Empresa, Fecha_Emision, Estado_SII, Estado_Envio, Lineas_Gestion, Lineas_Dynamics_OK, Total
      FROM U2
      ORDER BY Fecha_Emision DESC, Numero DESC, Tipo
      OFFSET (@page - 1) * @pageSize ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    const rows = await query<DocListItem[]>(sqlList, {
      fecha,
      empresa,
      tipo: tipo || "",
      numero: numero || "",
      search: search || "",
      tipoCol: tipoCol || "",
      sii: sii || "",
      dynamics: dynamics || "",
      page,
      pageSize,
    }, instance);

    const total = rows?.[0]?.Total ?? 0;
    const documentos = (rows ?? []).map((r) => ({
      tipo: r.Tipo,
      numero: r.Numero,
      idDocumento: r.Id_Documento,
      codEmpresa: r.Cod_Empresa,
      fechaEmision: r.Fecha_Emision,
      estadoSII: r.Estado_SII,
      estadoEnvio: r.Estado_Envio,
      lineasGestion: r.Lineas_Gestion,
      lineasDynamicsOk: r.Lineas_Dynamics_OK,
    }));

    return NextResponse.json({
      fecha,
      documentos,
      total,
      page,
      pageSize,
      totalPaginas: Math.ceil(total / pageSize) || 1,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API documentos]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
