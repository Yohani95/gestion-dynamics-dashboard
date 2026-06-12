import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isDynamicsODataConfigured } from "@/lib/dynamicsOData";
import { evaluarIntegridadVenta } from "@/lib/integridadVenta";

export const dynamic = "force-dynamic";

type DocRow = {
  Tipo: string;
  Numero: number;
  Id_Documento: string;
  Cod_Empresa: string;
  Fecha_Emision: string;
  Estado_SII: number | null;
  Lineas_Gestion: number;
  Lineas_Dynamics_OK: number;
};

type LineaRow = {
  Nro_Linea: number;
  Tipo_Movimiento: string | null;
  Estado: number | null;
  Id_Documento_Dynamics: string | null;
};

type ErrorRow = {
  Mensaje: string;
  Error: string;
};

type EstadoDocRow = {
  MinEstado: number | null;
  Id_Documento_Dynamics: string | null;
};

export async function GET(request: NextRequest) {
  const instance = request.headers.get("x-instance") || "default";
  const numero = request.nextUrl.searchParams.get("numero")?.trim();
  const tipo = request.nextUrl.searchParams.get("tipo")?.trim().toUpperCase() || null;
  const empresa = request.nextUrl.searchParams.get("empresa")?.trim() || null;

  if (!numero) {
    return NextResponse.json({ error: "Falta el parametro numero." }, { status: 400 });
  }

  try {
    const sqlDoc = `
      SELECT Tipo, Numero, Id_Documento, Cod_Empresa, Fecha_Emision, Estado_SII, Lineas_Gestion, Lineas_Dynamics_OK FROM (
        SELECT 'BLE' AS Tipo, Cab.Nro_Impreso AS Numero, Cab.Id_Boleta AS Id_Documento, Cab.Cod_Empresa,
               CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23) AS Fecha_Emision,
               Sii.Estado AS Estado_SII,
               (SELECT COUNT(*) FROM Ges_BlvDetalle D WITH (NOLOCK)
                WHERE D.Id_Boleta = Cab.Id_Boleta
                  AND UPPER(LTRIM(RTRIM(ISNULL(D.Tipo_Movimiento, '')))) <> 'C') AS Lineas_Gestion,
               (SELECT COUNT(*) FROM Ges_BlvDetalle D WITH (NOLOCK)
                WHERE D.Id_Boleta = Cab.Id_Boleta
                  AND UPPER(LTRIM(RTRIM(ISNULL(D.Tipo_Movimiento, '')))) <> 'C'
                  AND EXISTS (
                    SELECT 1 FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
                    WHERE E.Id_Documento = D.Id_Boleta
                      AND E.Id_Documento_Detalle = D.Id_DetalleBoleta
                      AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
                  )) AS Lineas_Dynamics_OK
        FROM Ges_BlvCabecera Cab WITH (NOLOCK)
        OUTER APPLY (SELECT TOP 1 Estado FROM Ges_EleDocSii S WITH (NOLOCK) WHERE S.Id_Documento = Cab.Id_Boleta) Sii
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        UNION ALL
        SELECT 'FCV', Cab.Nro_Impreso, Cab.Id_Factura, Cab.Cod_Empresa, CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23),
               Sii.Estado,
               (SELECT COUNT(*) FROM Ges_FcvDetalle D WITH (NOLOCK) WHERE D.Id_Factura = Cab.Id_Factura),
               (SELECT COUNT(*) FROM Ges_FcvDetalle D WITH (NOLOCK)
                WHERE D.Id_Factura = Cab.Id_Factura
                  AND EXISTS (
                    SELECT 1 FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
                    WHERE E.Id_Documento = D.Id_Factura
                      AND E.Id_Documento_Detalle = D.Id_DetalleFactura
                      AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
                  ))
        FROM Ges_FcvCabecera Cab WITH (NOLOCK)
        OUTER APPLY (SELECT TOP 1 Estado FROM Ges_EleDocSii S WITH (NOLOCK) WHERE S.Id_Documento = Cab.Id_Factura) Sii
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        UNION ALL
        SELECT 'NCV', Cab.Nro_Impreso, Cab.Id_NotaCredito, Cab.Cod_Empresa, CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23),
               Sii.Estado,
               (SELECT COUNT(*) FROM Ges_NcvDetalle D WITH (NOLOCK) WHERE D.Id_NotaCredito = Cab.Id_NotaCredito),
               (SELECT COUNT(*) FROM Ges_NcvDetalle D WITH (NOLOCK)
                WHERE D.Id_NotaCredito = Cab.Id_NotaCredito
                  AND EXISTS (
                    SELECT 1 FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
                    WHERE E.Id_Documento = D.Id_NotaCredito
                      AND E.Id_Documento_Detalle = D.Id_DetalleNotaCredito
                      AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
                  ))
        FROM Ges_NcvCabecera Cab WITH (NOLOCK)
        OUTER APPLY (SELECT TOP 1 Estado FROM Ges_EleDocSii S WITH (NOLOCK) WHERE S.Id_Documento = Cab.Id_NotaCredito) Sii
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
      ) U
      WHERE (@tipo IS NULL OR @tipo = '' OR Tipo = @tipo)
        AND (@empresa IS NULL OR @empresa = '' OR Cod_Empresa = CAST(NULLIF(@empresa, '') AS UNIQUEIDENTIFIER))
      ORDER BY Fecha_Emision DESC, Tipo ASC
    `;

    const docs = await query<DocRow[]>(sqlDoc, { numero, tipo, empresa }, instance);
    const doc = docs?.[0];
    if (!doc) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }

    let sqlLineas = "";
    if (doc.Tipo === "BLE") {
      sqlLineas = `
        SELECT Det.Nro_Linea, Det.Tipo_Movimiento, E.Estado, E.Id_Documento_Dynamics
        FROM Ges_BlvDetalle Det WITH (NOLOCK)
        LEFT JOIN Ges_EstadoEnvioDynamics E WITH (NOLOCK)
          ON E.Id_Documento = Det.Id_Boleta AND E.Id_Documento_Detalle = Det.Id_DetalleBoleta
        WHERE Det.Id_Boleta = CAST(@idDocumento AS UNIQUEIDENTIFIER)
        ORDER BY Det.Nro_Linea
      `;
    } else if (doc.Tipo === "FCV") {
      sqlLineas = `
        SELECT Det.Nro_Linea, CAST('' AS NVARCHAR(20)) AS Tipo_Movimiento, E.Estado, E.Id_Documento_Dynamics
        FROM Ges_FcvDetalle Det WITH (NOLOCK)
        LEFT JOIN Ges_EstadoEnvioDynamics E WITH (NOLOCK)
          ON E.Id_Documento = Det.Id_Factura AND E.Id_Documento_Detalle = Det.Id_DetalleFactura
        WHERE Det.Id_Factura = CAST(@idDocumento AS UNIQUEIDENTIFIER)
        ORDER BY Det.Nro_Linea
      `;
    } else {
      sqlLineas = `
        SELECT Det.Nro_Linea, CAST('' AS NVARCHAR(20)) AS Tipo_Movimiento, E.Estado, E.Id_Documento_Dynamics
        FROM Ges_NcvDetalle Det WITH (NOLOCK)
        LEFT JOIN Ges_EstadoEnvioDynamics E WITH (NOLOCK)
          ON E.Id_Documento = Det.Id_NotaCredito AND E.Id_Documento_Detalle = Det.Id_DetalleNotaCredito
        WHERE Det.Id_NotaCredito = CAST(@idDocumento AS UNIQUEIDENTIFIER)
        ORDER BY Det.Nro_Linea
      `;
    }

    const lineasRows = await query<LineaRow[]>(sqlLineas, { idDocumento: doc.Id_Documento }, instance);
    const lineas = (lineasRows ?? [])
      .filter((l) => (l.Tipo_Movimiento ?? "").toUpperCase() !== "C")
      .map((l) => ({
        nroLinea: l.Nro_Linea,
        tipoMovimiento: l.Tipo_Movimiento,
        estado: l.Estado,
        idDocumentoDynamics: l.Id_Documento_Dynamics,
      }));

    const estadoRows = await query<EstadoDocRow[]>(
      `
        SELECT
          (SELECT MIN(Estado) FROM Ges_EstadoEnvioDynamics WITH (NOLOCK) WHERE Id_Documento = CAST(@idDocumento AS UNIQUEIDENTIFIER)) AS MinEstado,
          (SELECT TOP 1 Id_Documento_Dynamics FROM Ges_EstadoEnvioDynamics WITH (NOLOCK) WHERE Id_Documento = CAST(@idDocumento AS UNIQUEIDENTIFIER) ORDER BY Fecha DESC) AS Id_Documento_Dynamics
      `,
      { idDocumento: doc.Id_Documento },
      instance,
    );

    const erroresRows = await query<ErrorRow[]>(
      `
        SELECT Mensaje, CONVERT(NVARCHAR(MAX), Error) AS Error
        FROM Ges_Salida_Error_Dyn WITH (NOLOCK)
        WHERE Numero LIKE '%' + @numero + '%' OR CONVERT(NVARCHAR(20), Numero) = @numero
        ORDER BY Fecha DESC
      `,
      { numero },
      instance,
    );

    const estadoEnvio = estadoRows?.[0]?.MinEstado ?? null;
    const idDocumentoDynamics = estadoRows?.[0]?.Id_Documento_Dynamics ?? null;

    const errores = (erroresRows ?? []).map((e) => ({
      mensaje: e.Mensaje,
      error: e.Error,
    }));

    const integridad = evaluarIntegridadVenta(
      {
        estadoSII: doc.Estado_SII,
        estadoEnvio,
        idDocumentoDynamics,
        lineasGestion: doc.Lineas_Gestion,
        lineasDynamicsOk: doc.Lineas_Dynamics_OK,
      },
      lineas,
      errores,
    );

    return NextResponse.json({
      documento: {
        tipo: doc.Tipo,
        numero: doc.Numero,
        idDocumento: doc.Id_Documento,
        codEmpresa: doc.Cod_Empresa,
        fechaEmision: doc.Fecha_Emision,
        estadoSII: doc.Estado_SII,
        estadoEnvio,
        idDocumentoDynamics,
      },
      integridad,
      erroresDynamics: errores.slice(0, 8),
      dynamicsBcDisponible: isDynamicsODataConfigured(),
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API documento/integridad]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
