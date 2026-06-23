import { getPool, sql } from "@/lib/db";
import {
  auditarLoteDocumentos,
  listarDocumentosAuditor,
  type DocAuditorRow,
  type RangoFechasAuditor,
} from "@/lib/auditorDynamics";
import type {
  AplicarReconciliacionIn,
  AplicarReconciliacionResult,
  ReconciliacionItem,
} from "@/lib/reconciliacionDynamics.types";

export {
  RECONCILIACION_APLICAR_MAX,
  RECONCILIACION_LOTE,
  type AplicarReconciliacionIn,
  type AplicarReconciliacionResult,
  type ReconciliacionItem,
} from "@/lib/reconciliacionDynamics.types";

/** Documento existe en BC y concuerda, pero Gestión aún no refleja el estado objetivo. */
export function evaluarCandidatoReconciliacion(
  resultado: Awaited<ReturnType<typeof auditarLoteDocumentos>>[number],
  estadoObjetivo: number,
  idBcDynamics: string | null,
): Pick<ReconciliacionItem, "candidato" | "estadoPropuesto" | "idBcDynamics" | "motivoExclusion"> {
  const actual = resultado.gestion.estadoEnvio ?? 0;

  if (actual >= estadoObjetivo) {
    return {
      candidato: false,
      estadoPropuesto: estadoObjetivo,
      idBcDynamics,
      motivoExclusion: `Ya está en estado ${actual} (objetivo ${estadoObjetivo}).`,
    };
  }

  if (resultado.estadoAuditoria === "omitido") {
    return {
      candidato: false,
      estadoPropuesto: estadoObjetivo,
      idBcDynamics,
      motivoExclusion: "Sin timbrar SII; no se compara con BC.",
    };
  }

  if (resultado.estadoAuditoria === "error") {
    const msg = resultado.hallazgos.find((h) => h.severidad === "error")?.mensaje ?? "Diferencia con BC.";
    return {
      candidato: false,
      estadoPropuesto: estadoObjetivo,
      idBcDynamics,
      motivoExclusion: msg,
    };
  }

  if (!resultado.bc?.encontrado && resultado.estadoAuditoria !== "ok" && resultado.estadoAuditoria !== "warning") {
    return {
      candidato: false,
      estadoPropuesto: estadoObjetivo,
      idBcDynamics,
      motivoExclusion: "No encontrado en Business Central.",
    };
  }

  const tieneErrorBc = resultado.hallazgos.some((h) => h.codigo === "no_en_bc" || h.codigo === "monto_diferente" || h.codigo === "menos_lineas");
  if (tieneErrorBc) {
    return {
      candidato: false,
      estadoPropuesto: estadoObjetivo,
      idBcDynamics,
      motivoExclusion: resultado.hallazgos.find((h) => h.severidad === "error")?.mensaje ?? "No coincide con BC.",
    };
  }

  return {
    candidato: true,
    estadoPropuesto: estadoObjetivo,
    idBcDynamics,
    motivoExclusion: null,
  };
}

export async function auditarParaReconciliacion(
  documentos: DocAuditorRow[],
  instance: string,
  estadoObjetivo: number,
): Promise<ReconciliacionItem[]> {
  const resultados = await auditarLoteDocumentos(documentos, instance);
  return resultados.map((r) => {
    const idBc = r.bc?.idDynamics ?? null;
    const evaluacion = evaluarCandidatoReconciliacion(r, estadoObjetivo, idBc);
    return { ...r, ...evaluacion };
  });
}

export async function listarYAuditarReconciliacion(
  rango: RangoFechasAuditor,
  instance: string,
  opts: {
    empresa?: string;
    tipo?: string;
    numero?: string;
    estadoSII?: string;
    estadoEnvioMax?: number;
    soloTimbrados?: boolean;
    estadoObjetivo?: number;
    offset?: number;
    limit?: number;
    soloCandidatos?: boolean;
  },
): Promise<{ items: ReconciliacionItem[]; total: number }> {
  const estadoObjetivo = opts.estadoObjetivo ?? 3;
  const estadoEnvioMax = opts.estadoEnvioMax ?? estadoObjetivo - 1;

  const { documentos, total } = await listarDocumentosAuditor(rango, instance, {
    empresa: opts.empresa,
    tipo: opts.tipo,
    numero: opts.numero,
    estadoSII: opts.estadoSII,
    estadoEnvioMax: estadoEnvioMax >= 0 ? estadoEnvioMax : estadoObjetivo - 1,
    soloTimbrados: opts.soloTimbrados,
    offset: opts.offset,
    limit: opts.limit,
  });

  const items = await auditarParaReconciliacion(documentos, instance, estadoObjetivo);
  const filtrados = opts.soloCandidatos ? items.filter((i) => i.candidato) : items;

  return { items: filtrados, total };
}

const DETALLE_SQL: Record<string, { detalle: string; idCol: string; filtroMovC: boolean }> = {
  BLE: { detalle: "Ges_BlvDetalle", idCol: "Id_DetalleBoleta", filtroMovC: true },
  FCV: { detalle: "Ges_FcvDetalle", idCol: "Id_DetalleFactura", filtroMovC: false },
  NCV: { detalle: "Ges_NcvDetalle", idCol: "Id_DetalleNotaCredito", filtroMovC: false },
};

export async function aplicarEstadoDynamicsDocumento(
  instance: string,
  input: AplicarReconciliacionIn & { nuevoEstado: number },
): Promise<AplicarReconciliacionResult> {
  const tipo = input.tipo.trim().toUpperCase();
  const meta = DETALLE_SQL[tipo];
  if (!meta) {
    return {
      idDocumento: input.idDocumento,
      tipo,
      numero: input.numero,
      ok: false,
      filasActualizadas: 0,
      filasInsertadas: 0,
      error: `Tipo no soportado: ${tipo}`,
    };
  }

  const idDocumento = input.idDocumento.trim();
  const nuevoEstado = input.nuevoEstado;
  const idBc = input.idBcDynamics?.trim() || null;

  const pool = await getPool(instance);
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const reqUpdate = new sql.Request(transaction);
    reqUpdate.input("IdDocumento", sql.UniqueIdentifier, idDocumento);
    reqUpdate.input("NuevoEstado", sql.Int, nuevoEstado);
    reqUpdate.input("IdBc", sql.NVarChar(100), idBc);

    const updateResult = await reqUpdate.query(`
      UPDATE E
      SET
        E.Estado = @NuevoEstado,
        E.Fecha = GETDATE(),
        E.Id_Documento_Dynamics = CASE
          WHEN @IdBc IS NOT NULL AND LTRIM(RTRIM(@IdBc)) <> '' THEN @IdBc
          ELSE E.Id_Documento_Dynamics
        END
      FROM Ges_EstadoEnvioDynamics E
      WHERE E.Id_Documento = @IdDocumento
        AND ISNULL(E.Estado, 0) < @NuevoEstado;
    `);

    const filasActualizadas = updateResult.rowsAffected[0] ?? 0;

    const parentCol =
      tipo === "BLE" ? "Id_Boleta" : tipo === "FCV" ? "Id_Factura" : "Id_NotaCredito";
    const filtroMov = meta.filtroMovC
      ? "AND UPPER(LTRIM(RTRIM(ISNULL(Det.Tipo_Movimiento, '')))) <> 'C'"
      : "";

    const reqInsert = new sql.Request(transaction);
    reqInsert.input("IdDocumento", sql.UniqueIdentifier, idDocumento);
    reqInsert.input("NuevoEstado", sql.Int, nuevoEstado);
    reqInsert.input("IdBc", sql.NVarChar(100), idBc);

    const insertSql = `
      INSERT INTO Ges_EstadoEnvioDynamics (Id_Documento, Id_Documento_Detalle, Estado, Fecha, Id_Documento_Dynamics)
      SELECT
        Det.${parentCol},
        Det.${meta.idCol},
        @NuevoEstado,
        GETDATE(),
        @IdBc
      FROM ${meta.detalle} Det WITH (NOLOCK)
      WHERE Det.${parentCol} = @IdDocumento
        ${filtroMov}
        AND NOT EXISTS (
          SELECT 1
          FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
          WHERE E.Id_Documento = Det.${parentCol}
            AND E.Id_Documento_Detalle = Det.${meta.idCol}
        );
    `;

    let filasInsertadas = 0;
    try {
      const insertResult = await reqInsert.query(insertSql);
      filasInsertadas = insertResult.rowsAffected[0] ?? 0;
    } catch {
      // Si el INSERT falla por esquema desconocido, al menos conservamos UPDATE.
      if (filasActualizadas === 0) {
        throw new Error("No hay filas en Ges_EstadoEnvioDynamics y no se pudo insertar estado por línea.");
      }
    }

    if (filasActualizadas === 0 && filasInsertadas === 0) {
      throw new Error("No se modificó ninguna fila (revise si el documento ya está sincronizado).");
    }

    await transaction.commit();

    return {
      idDocumento,
      tipo,
      numero: input.numero,
      ok: true,
      filasActualizadas,
      filasInsertadas,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      idDocumento,
      tipo,
      numero: input.numero,
      ok: false,
      filasActualizadas: 0,
      filasInsertadas: 0,
      error: message,
    };
  }
}

export async function aplicarReconciliacionLote(
  instance: string,
  documentos: (AplicarReconciliacionIn & { nuevoEstado: number })[],
): Promise<AplicarReconciliacionResult[]> {
  const resultados: AplicarReconciliacionResult[] = [];
  for (const doc of documentos) {
    resultados.push(await aplicarEstadoDynamicsDocumento(instance, doc));
  }
  return resultados;
}
