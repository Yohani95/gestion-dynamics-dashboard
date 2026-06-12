import { query } from "@/lib/db";
import {
  buscarDocumentoEnOData,
  formatBcDocumentNumber,
  isDynamicsODataConfigured,
  type BcDocumentoVista,
} from "@/lib/dynamicsOData";
import {
  AUDITOR_DYNAMICS_LOTE,
  AUDITOR_MONTO_TOLERANCIA,
  type HallazgoAuditor,
  type ResultadoAuditorDocumento,
} from "@/lib/auditorDynamics.types";

export {
  AUDITOR_DYNAMICS_LOTE,
  AUDITOR_MONTO_TOLERANCIA,
  type HallazgoCodigo,
  type HallazgoAuditor,
  type ResultadoAuditorDocumento,
} from "@/lib/auditorDynamics.types";

export type DocAuditorRow = {
  tipo: string;
  numero: number;
  idDocumento: string;
  codEmpresa: string;
  empresaNombre: string;
  fechaEmision: string;
  estadoSII: number | null;
  estadoEnvio: number | null;
  lineasGestion: number;
  totalGestion: number;
};

export type RangoFechasAuditor = { desde: string; hasta: string };

export async function listarDocumentosAuditor(
  rango: RangoFechasAuditor,
  instance: string,
  opts?: {
    empresa?: string;
    tipo?: string;
    numero?: string;
    estadoSII?: string;
    estadoEnvio?: string;
    soloTimbrados?: boolean;
    offset?: number;
    limit?: number;
  },
): Promise<{ documentos: DocAuditorRow[]; total: number }> {
  const empresa = opts?.empresa?.trim() ?? "";
  const tipo = opts?.tipo?.trim().toUpperCase() ?? "";
  const numero = opts?.numero?.trim() ?? "";
  const estadoSII = opts?.estadoSII?.trim() ?? "";
  const estadoEnvio = opts?.estadoEnvio?.trim() ?? "";
  const soloTimbrados = opts?.soloTimbrados !== false;
  const offset = Math.max(0, opts?.offset ?? 0);
  const limit = Math.min(50, Math.max(1, opts?.limit ?? AUDITOR_DYNAMICS_LOTE));

  const sql = `
    WITH U AS (
      SELECT 'BLE' AS Tipo, Cab.Nro_Impreso AS Numero, Cab.Id_Boleta AS Id_Documento, Cab.Cod_Empresa,
             CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23) AS Fecha_Emision,
             Sii.Estado AS Estado_SII, L.Estado AS Estado_Envio,
             ISNULL(Cab.Total, 0) AS Total_Gestion,
             (SELECT COUNT(*) FROM Ges_BlvDetalle D WITH (NOLOCK)
              WHERE D.Id_Boleta = Cab.Id_Boleta
                AND UPPER(LTRIM(RTRIM(ISNULL(D.Tipo_Movimiento, '')))) <> 'C') AS Lineas_Gestion
      FROM Ges_BlvCabecera Cab WITH (NOLOCK)
      OUTER APPLY (SELECT TOP 1 Estado FROM Ges_EleDocSii S WITH (NOLOCK) WHERE S.Id_Documento = Cab.Id_Boleta) Sii
      OUTER APPLY (SELECT MIN(Estado) AS Estado FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK) WHERE E.Id_Documento = Cab.Id_Boleta) L
      WHERE CONVERT(DATE, Cab.Fecha_Emision) BETWEEN CAST(@fechaDesde AS DATE) AND CAST(@fechaHasta AS DATE)
        AND (@soloTimbrados = 0 OR Sii.Estado = 2)
        AND (NULLIF(@empresa, '') IS NULL OR Cab.Cod_Empresa = TRY_CAST(@empresa AS uniqueidentifier))
        AND (NULLIF(@numero, '') IS NULL OR Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) LIKE '%' + @numero + '%')
      UNION ALL
      SELECT 'FCV', Cab.Nro_Impreso, Cab.Id_Factura, Cab.Cod_Empresa, CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23),
             Sii.Estado, L.Estado, ISNULL(Cab.Total, 0),
             (SELECT COUNT(*) FROM Ges_FcvDetalle D WITH (NOLOCK) WHERE D.Id_Factura = Cab.Id_Factura)
      FROM Ges_FcvCabecera Cab WITH (NOLOCK)
      OUTER APPLY (SELECT TOP 1 Estado FROM Ges_EleDocSii S WITH (NOLOCK) WHERE S.Id_Documento = Cab.Id_Factura) Sii
      OUTER APPLY (SELECT MIN(Estado) AS Estado FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK) WHERE E.Id_Documento = Cab.Id_Factura) L
      WHERE CONVERT(DATE, Cab.Fecha_Emision) BETWEEN CAST(@fechaDesde AS DATE) AND CAST(@fechaHasta AS DATE)
        AND (@soloTimbrados = 0 OR Sii.Estado = 2)
        AND (NULLIF(@empresa, '') IS NULL OR Cab.Cod_Empresa = TRY_CAST(@empresa AS uniqueidentifier))
        AND (NULLIF(@numero, '') IS NULL OR Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) LIKE '%' + @numero + '%')
      UNION ALL
      SELECT 'NCV', Cab.Nro_Impreso, Cab.Id_NotaCredito, Cab.Cod_Empresa, CONVERT(VARCHAR(10), Cab.Fecha_Emision, 23),
             Sii.Estado, L.Estado, ISNULL(Cab.Total, 0),
             (SELECT COUNT(*) FROM Ges_NcvDetalle D WITH (NOLOCK) WHERE D.Id_NotaCredito = Cab.Id_NotaCredito)
      FROM Ges_NcvCabecera Cab WITH (NOLOCK)
      OUTER APPLY (SELECT TOP 1 Estado FROM Ges_EleDocSii S WITH (NOLOCK) WHERE S.Id_Documento = Cab.Id_NotaCredito) Sii
      OUTER APPLY (SELECT MIN(Estado) AS Estado FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK) WHERE E.Id_Documento = Cab.Id_NotaCredito) L
      WHERE CONVERT(DATE, Cab.Fecha_Emision) BETWEEN CAST(@fechaDesde AS DATE) AND CAST(@fechaHasta AS DATE)
        AND (@soloTimbrados = 0 OR Sii.Estado = 2)
        AND (NULLIF(@empresa, '') IS NULL OR Cab.Cod_Empresa = TRY_CAST(@empresa AS uniqueidentifier))
        AND (NULLIF(@numero, '') IS NULL OR Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) LIKE '%' + @numero + '%')
    ),
    U2 AS (
      SELECT U.*, Emp.Descripcion AS Empresa_Nombre, COUNT(*) OVER() AS TotalFilas
      FROM U
      INNER JOIN Ges_Empresas Emp WITH (NOLOCK) ON Emp.Cod_Empresa = U.Cod_Empresa
      WHERE (NULLIF(@tipo, '') IS NULL OR U.Tipo = @tipo)
        AND (NULLIF(@estadoSII, '') IS NULL OR ISNULL(U.Estado_SII, -1) = TRY_CAST(@estadoSII AS INT))
        AND (
          NULLIF(@estadoEnvio, '') IS NULL
          OR (TRY_CAST(@estadoEnvio AS INT) = 0 AND (U.Estado_Envio IS NULL OR U.Estado_Envio = 0))
          OR (TRY_CAST(@estadoEnvio AS INT) <> 0 AND U.Estado_Envio = TRY_CAST(@estadoEnvio AS INT))
        )
    )
    SELECT Tipo, Numero, Id_Documento, Cod_Empresa, Empresa_Nombre, Fecha_Emision,
           Estado_SII, Estado_Envio, Lineas_Gestion, Total_Gestion, TotalFilas
    FROM U2
    ORDER BY Fecha_Emision, Tipo, Numero
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `;

  type Row = {
    Tipo: string;
    Numero: number;
    Id_Documento: string;
    Cod_Empresa: string;
    Empresa_Nombre: string;
    Fecha_Emision: string;
    Estado_SII: number | null;
    Estado_Envio: number | null;
    Lineas_Gestion: number;
    Total_Gestion: number;
    TotalFilas: number;
  };

  const rows = await query<Row[]>(
    sql,
    {
      fechaDesde: rango.desde,
      fechaHasta: rango.hasta,
      empresa,
      tipo,
      numero,
      estadoSII,
      estadoEnvio,
      soloTimbrados: soloTimbrados ? 1 : 0,
      offset,
      limit,
    },
    instance,
  );

  const total = rows?.[0]?.TotalFilas ?? 0;
  const documentos = (rows ?? []).map((r) => ({
    tipo: r.Tipo,
    numero: r.Numero,
    idDocumento: r.Id_Documento,
    codEmpresa: r.Cod_Empresa,
    empresaNombre: r.Empresa_Nombre,
    fechaEmision: r.Fecha_Emision,
    estadoSII: r.Estado_SII,
    estadoEnvio: r.Estado_Envio,
    lineasGestion: r.Lineas_Gestion,
    totalGestion: Number(r.Total_Gestion) || 0,
  }));

  return { documentos, total };
}

function detectarLineasDuplicadasBc(lineas: BcDocumentoVista["lineas"]): string[] {
  const porProducto = new Map<string, number>();
  for (const l of lineas) {
    const key = (l.producto ?? l.descripcion ?? "").trim().toUpperCase() || `SEQ-${l.secuencia}`;
    porProducto.set(key, (porProducto.get(key) ?? 0) + 1);
  }
  return [...porProducto.entries()]
    .filter(([, n]) => n > 1)
    .map(([k, n]) => `${k} (${n} veces)`);
}

export function compararDocumentoConBc(
  doc: DocAuditorRow,
  vista: BcDocumentoVista | undefined,
  encontrado: boolean,
  errorBc?: string,
): ResultadoAuditorDocumento {
  const hallazgos: HallazgoAuditor[] = [];
  const numeroBc = formatBcDocumentNumber(doc.tipo, String(doc.numero));

  if (doc.estadoSII !== 2) {
    hallazgos.push({
      codigo: "sin_timbrar",
      severidad: "warning",
      mensaje: "Documento sin timbrar SII; se omite comparación con BC.",
    });
    return buildResultado(doc, numeroBc, hallazgos, "omitido", undefined, false);
  }

  if (errorBc) {
    hallazgos.push({ codigo: "error_bc", severidad: "error", mensaje: errorBc });
    return buildResultado(doc, numeroBc, hallazgos, "error", undefined, false);
  }

  if (!encontrado || !vista) {
    hallazgos.push({
      codigo: "no_en_bc",
      severidad: "error",
      mensaje: `No existe en Business Central (${numeroBc}).`,
    });
    return buildResultado(doc, numeroBc, hallazgos, "error", undefined, false);
  }

  const diffMonto = Math.abs(doc.totalGestion - (vista.montoTotal ?? 0));
  if (diffMonto > AUDITOR_MONTO_TOLERANCIA) {
    hallazgos.push({
      codigo: "monto_diferente",
      severidad: "error",
      mensaje: `Monto distinto: Gestión $${doc.totalGestion.toLocaleString("es-CL")} vs BC $${(vista.montoTotal ?? 0).toLocaleString("es-CL")} (Δ $${diffMonto.toLocaleString("es-CL")}).`,
    });
  }

  const lineasBc = vista.cantidadLineas;
  if (lineasBc < doc.lineasGestion) {
    hallazgos.push({
      codigo: "menos_lineas",
      severidad: "error",
      mensaje: `BC tiene menos líneas: Gestión ${doc.lineasGestion} vs BC ${lineasBc}.`,
    });
  } else if (lineasBc > doc.lineasGestion) {
    hallazgos.push({
      codigo: "mas_lineas",
      severidad: "warning",
      mensaje: `BC tiene más líneas: Gestión ${doc.lineasGestion} vs BC ${lineasBc}.`,
    });
  }

  const dupes = detectarLineasDuplicadasBc(vista.lineas);
  if (dupes.length > 0) {
    hallazgos.push({
      codigo: "lineas_duplicadas_bc",
      severidad: "warning",
      mensaje: `Líneas duplicadas en BC: ${dupes.join(", ")}.`,
    });
  }

  if (hallazgos.length === 0) {
    hallazgos.push({
      codigo: "ok",
      severidad: "ok",
      mensaje: "Monto y cantidad de líneas concuerdan con BC.",
    });
  }

  const tieneError = hallazgos.some((h) => h.severidad === "error");
  const tieneWarning = hallazgos.some((h) => h.severidad === "warning");
  const estadoAuditoria = tieneError ? "error" : tieneWarning ? "warning" : "ok";

  return buildResultado(doc, numeroBc, hallazgos, estadoAuditoria, vista, true);
}

function buildResultado(
  doc: DocAuditorRow,
  numeroBc: string,
  hallazgos: HallazgoAuditor[],
  estadoAuditoria: ResultadoAuditorDocumento["estadoAuditoria"],
  vista: BcDocumentoVista | undefined,
  encontrado: boolean,
): ResultadoAuditorDocumento {
  return {
    tipo: doc.tipo,
    numero: doc.numero,
    codEmpresa: doc.codEmpresa,
    empresaNombre: doc.empresaNombre,
    fechaEmision: doc.fechaEmision,
    numeroBc,
    estadoAuditoria,
    hallazgos,
    gestion: {
      lineas: doc.lineasGestion,
      total: doc.totalGestion,
      estadoSII: doc.estadoSII,
      estadoEnvio: doc.estadoEnvio,
    },
    bc: vista
      ? {
          encontrado,
          lineas: vista.cantidadLineas,
          total: vista.montoTotal,
          estado: vista.estadoLabel,
        }
      : encontrado
        ? undefined
        : { encontrado: false, lineas: 0 },
  };
}

export async function auditarLoteDocumentos(
  documentos: DocAuditorRow[],
  instance: string,
): Promise<ResultadoAuditorDocumento[]> {
  const resultados: ResultadoAuditorDocumento[] = [];

  for (const doc of documentos) {
    if (doc.estadoSII !== 2) {
      resultados.push(compararDocumentoConBc(doc, undefined, false));
      continue;
    }

    const bc = await buscarDocumentoEnOData(String(doc.numero), doc.tipo, doc.codEmpresa, instance);
    resultados.push(
      compararDocumentoConBc(
        doc,
        bc.vista,
        bc.encontrado,
        bc.error ?? (!bc.encontrado && bc.consultado ? bc.resumen : undefined),
      ),
    );
  }

  return resultados;
}

export function resumenAuditoria(resultados: ResultadoAuditorDocumento[]) {
  return {
    total: resultados.length,
    ok: resultados.filter((r) => r.estadoAuditoria === "ok").length,
    warning: resultados.filter((r) => r.estadoAuditoria === "warning").length,
    error: resultados.filter((r) => r.estadoAuditoria === "error").length,
    omitidos: resultados.filter((r) => r.estadoAuditoria === "omitido").length,
  };
}

export { isDynamicsODataConfigured };
