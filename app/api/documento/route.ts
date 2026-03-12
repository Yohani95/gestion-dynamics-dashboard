import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

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
  Estado_Envio?: number | null;
  Id_Documento_Dynamics?: string | null;
};

type ErrorRow = {
  Fecha: string;
  Mensaje: string;
  Tipo: string;
  Numero: string;
  Error: string;
};

function buildDiagnostico(
  doc: DocRow | null,
  errores: ErrorRow[]
): string {
  if (!doc) {
    return "Documento no encontrado en BLE, FCV ni NCV. Verifica el número.";
  }
  const partes: string[] = [];
  const estadoSii = doc.Estado_SII ?? null;
  const estadoEnv = doc.Estado_Envio ?? null;

  if (estadoSii === 1) {
    partes.push("No está timbrado en SII (Estado_SII = 1). No se envía a Dynamics hasta que esté timbrado.");
  } else if (estadoSii === 2) {
    partes.push("Timbrado en SII (Estado_SII = 2).");
  }

  if (estadoEnv === null) {
    partes.push("No aparece en Ges_EstadoEnvioDynamics: no se ha enviado a Dynamics (o ninguna línea tiene estado).");
  } else {
    const textos: Record<number, string> = {
      0: "Sin enviar (0)",
      1: "Enviada a Dynamics (1), pendiente localización (PASO 3).",
      2: "Localización actualizada (2), pendiente registro (PASO 4).",
      3: "Registrado en Dynamics (3).",
      4: "Medio de pago listo (4).",
    };
    partes.push(textos[estadoEnv] ?? `Estado Dynamics: ${estadoEnv}`);
  }

  if (errores.length > 0) {
    partes.push(`Hay ${errores.length} error(es) registrado(s) en Ges_Salida_Error_Dyn.`);
  }

  const lineas = (doc as DocRow & { Lineas_Gestion?: number }).Lineas_Gestion;
  const lineasDynamicsOk = (doc as DocRow & { Lineas_Dynamics_OK?: number }).Lineas_Dynamics_OK ?? 0;
  if (typeof lineas === "number" && lineas > 0) {
    if (lineasDynamicsOk < lineas) {
      partes.push(`Sincronización de líneas Dynamics: ${lineas}/${lineasDynamicsOk} (incompleto). Usa Reprocesar para completar.`);
    } else {
      partes.push(`Sincronización de líneas Dynamics: ${lineas}/${lineasDynamicsOk}.`);
    }
  }

  return partes.join(" ") || "Sin diagnóstico adicional.";
}

export async function GET(request: NextRequest) {
  const instance = request.headers.get("x-instance") || "default";
  const numero = request.nextUrl.searchParams.get("numero")?.trim();
  let tipoParam = request.nextUrl.searchParams.get("tipo")?.trim().toUpperCase() || null;
  let empresaParam = request.nextUrl.searchParams.get("empresa")?.trim() || null;

  if (tipoParam === "UNDEFINED" || tipoParam === "NULL") tipoParam = null;
  if (empresaParam === "undefined" || empresaParam === "null") empresaParam = null;

  if (!numero) {
    return NextResponse.json(
      { error: "Falta el parámetro numero (ej: ?numero=6512585)" },
      { status: 400 }
    );
  }

  try {
    // Buscar documentos que coincidan con número, tipo y empresa
    const sqlDoc = `
      SELECT Tipo, Numero, Id_Documento, Cod_Empresa, Fecha_Emision, Estado_SII, Lineas_Gestion, Lineas_Dynamics_OK FROM (
        SELECT 'BLE' AS Tipo, Cab.Nro_Impreso AS Numero, Cab.Id_Boleta AS Id_Documento, Cab.Cod_Empresa, 
               CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23) AS Fecha_Emision,
               Sii.Estado AS Estado_SII,
               (SELECT COUNT(*)
                FROM Ges_BlvDetalle D WITH (NOLOCK)
                WHERE D.Id_Boleta = Cab.Id_Boleta
                  AND UPPER(LTRIM(RTRIM(ISNULL(D.Tipo_Movimiento, '')))) <> 'C') AS Lineas_Gestion,
               (SELECT COUNT(*) FROM Ges_BlvDetalle D WITH (NOLOCK)
                WHERE D.Id_Boleta = Cab.Id_Boleta
                  AND UPPER(LTRIM(RTRIM(ISNULL(D.Tipo_Movimiento, '')))) <> 'C'
                  AND EXISTS (
                    SELECT 1
                    FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
                    WHERE E.Id_Documento = D.Id_Boleta
                      AND E.Id_Documento_Detalle = D.Id_DetalleBoleta
                      AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
                  )) AS Lineas_Dynamics_OK,
               (SELECT COUNT(*) FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK) WHERE E.Id_Documento = Cab.Id_Boleta) AS CntDynamics
        FROM Ges_BlvCabecera Cab WITH (NOLOCK)
        OUTER APPLY (SELECT TOP 1 Estado FROM Ges_EleDocSii S WITH (NOLOCK) WHERE S.Id_Documento = Cab.Id_Boleta) Sii
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        UNION ALL
        SELECT 'FCV', Cab.Nro_Impreso, Cab.Id_Factura, Cab.Cod_Empresa, CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23) AS Fecha_Emision,
               Sii.Estado,
               (SELECT COUNT(*) FROM Ges_FcvDetalle D WITH (NOLOCK) WHERE D.Id_Factura = Cab.Id_Factura) AS Lineas_Gestion,
               (SELECT COUNT(*) FROM Ges_FcvDetalle D WITH (NOLOCK)
                WHERE D.Id_Factura = Cab.Id_Factura
                  AND EXISTS (
                    SELECT 1
                    FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
                    WHERE E.Id_Documento = D.Id_Factura
                      AND E.Id_Documento_Detalle = D.Id_DetalleFactura
                      AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
                  )) AS Lineas_Dynamics_OK,
               (SELECT COUNT(*) FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK) WHERE E.Id_Documento = Cab.Id_Factura) AS CntDynamics
        FROM Ges_FcvCabecera Cab WITH (NOLOCK)
        OUTER APPLY (SELECT TOP 1 Estado FROM Ges_EleDocSii S WITH (NOLOCK) WHERE S.Id_Documento = Cab.Id_Factura) Sii
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        UNION ALL
        SELECT 'NCV', Cab.Nro_Impreso, Cab.Id_NotaCredito, Cab.Cod_Empresa, CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23) AS Fecha_Emision,
               Sii.Estado,
               (SELECT COUNT(*) FROM Ges_NcvDetalle D WITH (NOLOCK) WHERE D.Id_NotaCredito = Cab.Id_NotaCredito) AS Lineas_Gestion,
               (SELECT COUNT(*) FROM Ges_NcvDetalle D WITH (NOLOCK)
                WHERE D.Id_NotaCredito = Cab.Id_NotaCredito
                  AND EXISTS (
                    SELECT 1
                    FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
                    WHERE E.Id_Documento = D.Id_NotaCredito
                      AND E.Id_Documento_Detalle = D.Id_DetalleNotaCredito
                      AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
                  )) AS Lineas_Dynamics_OK,
               (SELECT COUNT(*) FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK) WHERE E.Id_Documento = Cab.Id_NotaCredito) AS CntDynamics
        FROM Ges_NcvCabecera Cab WITH (NOLOCK)
        OUTER APPLY (SELECT TOP 1 Estado FROM Ges_EleDocSii S WITH (NOLOCK) WHERE S.Id_Documento = Cab.Id_NotaCredito) Sii
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
      ) U
      WHERE (@tipo IS NULL OR @tipo = '' OR Tipo = @tipo)
        AND (@empresa IS NULL OR @empresa = '' OR Cod_Empresa = CAST(NULLIF(@empresa, '') AS UNIQUEIDENTIFIER))
      ORDER BY CntDynamics DESC, Lineas_Gestion DESC, Fecha_Emision DESC
    `;

    const sqlErrores = `
      SELECT CONVERT(VARCHAR(19), Fecha, 120) AS Fecha, Mensaje, Tipo, Numero, CONVERT(NVARCHAR(MAX), Error) AS Error
      FROM Ges_Salida_Error_Dyn WITH (NOLOCK)
      WHERE Numero LIKE '%' + @numero + '%' OR CONVERT(NVARCHAR(20), Numero) = @numero
      ORDER BY Fecha DESC
    `;

    const [docsRaw, errores] = await Promise.all([
      query<DocRow[]>(sqlDoc, { numero, tipo: tipoParam, empresa: empresaParam }, instance),
      query<ErrorRow[]>(sqlErrores, { numero }, instance),
    ]);

    // Colapsar documentos que tengan la misma combinación Tipo_Empresa_Numero
    // (Por si la BD tiene data basura triplicada. Tomamos el primero porque el SQL ordena por mayor avance en Dynamics).
    const uniqueDocsMap = new Map<string, DocRow>();
    if (docsRaw) {
      for (const d of docsRaw) {
        const key = `${d.Tipo}_${d.Cod_Empresa}_${d.Numero}`;
        if (!uniqueDocsMap.has(key)) {
          uniqueDocsMap.set(key, d);
        }
      }
    }
    const docs = Array.from(uniqueDocsMap.values());

    // Si hay más de 1 combinacion unica, y el usuario no mandó todos los filtros, pedimos desambiguar.
    const hasAmbiguity = docs.length > 1 && (!tipoParam || !empresaParam);

    if (hasAmbiguity) {
      return NextResponse.json({
        numero: numero,
        documentosPosibles: docs.map((d) => ({
          tipo: d.Tipo,
          numero: d.Numero,
          idDocumento: d.Id_Documento,
          codEmpresa: d.Cod_Empresa,
          fechaEmision: d.Fecha_Emision,
          estadoSII: d.Estado_SII,
          lineasGestion: d.Lineas_Gestion,
          lineasDynamicsOk: d.Lineas_Dynamics_OK,
        })),
        documento: null,
        errores: [],
        diagnostico: `Se encontraron ${docs.length} documentos con el número ${numero}. Por favor, selecciona la entidad o tipo correctos.`,
      });
    }

    const doc = docs.length > 0 ? docs[0] : null;

    // Estado e Id_Documento_Dynamics según las LÍNEAS (no un JOIN arbitrario)
    type EstadoDocRow = { MinEstado: number | null; Id_Documento_Dynamics: string | null };
    let estadoEnvio: number | null = null;
    let idDocumentoDynamics: string | null = null;
    type UltimoLogRow = { Estado: number | null; Fecha: string | null };
    let ultimoLog: { estado: number | null; fecha: string | null } | null = null;

    if (doc?.Id_Documento) {
      const sqlEstadoPorLineas = `
        SELECT
          (SELECT MIN(Estado) FROM Ges_EstadoEnvioDynamics WITH (NOLOCK) WHERE Id_Documento = CAST(@idDocumento AS UNIQUEIDENTIFIER)) AS MinEstado,
          (SELECT TOP 1 Id_Documento_Dynamics FROM Ges_EstadoEnvioDynamics WITH (NOLOCK) WHERE Id_Documento = CAST(@idDocumento AS UNIQUEIDENTIFIER) ORDER BY Fecha DESC) AS Id_Documento_Dynamics
      `;
      const estadoRows = await query<EstadoDocRow[]>(sqlEstadoPorLineas, {
        idDocumento: doc.Id_Documento,
      }, instance);
      const er = estadoRows?.[0];
      if (er?.MinEstado != null) {
        estadoEnvio = er.MinEstado;
      }
      if (er?.Id_Documento_Dynamics != null) {
        idDocumentoDynamics = er.Id_Documento_Dynamics;
      }

      const sqlUltimoLog = `
        SELECT TOP 1 Estado, CONVERT(VARCHAR(19), Fecha, 120) AS Fecha
        FROM Ges_EstadoEnvioDynamics WITH (NOLOCK)
        WHERE Id_Documento = CAST(@idDocumento AS UNIQUEIDENTIFIER)
        ORDER BY Fecha DESC
      `;
      const rows = await query<UltimoLogRow[]>(sqlUltimoLog, {
        idDocumento: doc.Id_Documento,
      }, instance);
      const r = rows?.[0];
      if (r) {
        ultimoLog = { estado: r.Estado ?? null, fecha: r.Fecha ?? null };
      }
    }

    const diagnostico = buildDiagnostico(
      doc ? { ...doc, Estado_Envio: estadoEnvio, Id_Documento_Dynamics: idDocumentoDynamics } : null,
      errores ?? []
    );

    return NextResponse.json({
      numero: numero,
      documento: doc
        ? {
          tipo: doc.Tipo,
          numero: doc.Numero,
          idDocumento: doc.Id_Documento,
          codEmpresa: doc.Cod_Empresa,
          fechaEmision: doc.Fecha_Emision,
          estadoSII: doc.Estado_SII,
          estadoEnvio: estadoEnvio,
          idDocumentoDynamics: idDocumentoDynamics,
          lineasGestion: doc.Lineas_Gestion,
          lineasDynamicsOk: doc.Lineas_Dynamics_OK,
        }
        : null,
      errores: (errores ?? []).map((e) => ({
        fecha: e.Fecha,
        mensaje: e.Mensaje,
        tipo: e.Tipo,
        numero: e.Numero,
        error: e.Error,
      })),
      ultimoLog,
      diagnostico,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const message = err.message;
    const stack = process.env.NODE_ENV === "development" ? err.stack : undefined;
    console.error("[API documento]", message, stack ?? "");
    return NextResponse.json(
      {
        error: message,
        stack,
        diagnostico: "Revisa .env.local (SQL_SERVER, SQL_DATABASE, SQL_USER, SQL_PASSWORD) y que el servidor sea accesible.",
      },
      { status: 500 }
    );
  }
}
