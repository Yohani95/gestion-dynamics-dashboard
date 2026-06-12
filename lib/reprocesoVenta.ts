import { getPool, sql } from "@/lib/db";
import { insertAdvancedAuditSafe } from "@/lib/advancedControl";
import { normalizeRut, normalizeTipoFolio } from "@/lib/reprocesoMasivoExcel";

export const BULK_REPROCESO_MAX = 40;

export type ReprocesoDocumentoIn = {
  idDocumento: string;
  codEmpresa: string;
  fecha: string;
  numero?: string;
  tipo?: string;
};

export type ReprocesoUnoResult = {
  ok: boolean;
  idDocumento: string;
  numero?: string;
  tipo?: string;
  rut?: string;
  status?: number;
  mensaje?: string;
  error?: string;
  auditId?: number;
};

export type ExcelFilaIn = {
  rut: string;
  numero: string;
  tipo: string;
  fila?: number;
};

const TABLE_MAP: Record<string, { table: string; col: string }> = {
  BLE: { table: "Ges_BlvCabecera", col: "Id_Boleta" },
  FCV: { table: "Ges_FcvCabecera", col: "Id_Factura" },
  NCV: { table: "Ges_NcvCabecera", col: "Id_NotaCredito" },
};

function fechaParaSql(fechaRaw: string): string {
  const t = fechaRaw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toISOString().slice(0, 10);
}

function normalizeRutSql(value: string): string {
  return value.replace(/[.\s-]/g, "").toUpperCase();
}

type EmpresaRutRow = {
  Cod_Empresa: string;
  Descripcion: string;
  RutNorm: string;
};

export async function loadEmpresaRutMap(
  pool: Awaited<ReturnType<typeof getPool>>,
): Promise<Map<string, { codEmpresa: string; descripcion: string }>> {
  const result = await pool.request().query<EmpresaRutRow>(`
    SELECT
      Cod_Empresa,
      Descripcion,
      UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(Rut_Empresa, ''))), '.', ''), '-', ''), ' ', '')) AS RutNorm
    FROM Ges_Empresas WITH (NOLOCK)
    WHERE NULLIF(LTRIM(RTRIM(ISNULL(Rut_Empresa, ''))), '') IS NOT NULL
  `);

  const map = new Map<string, { codEmpresa: string; descripcion: string }>();
  for (const row of result.recordset) {
    const rutNorm = normalizeRutSql(row.RutNorm ?? "");
    if (!rutNorm) continue;
    map.set(rutNorm, {
      codEmpresa: row.Cod_Empresa,
      descripcion: row.Descripcion ?? "",
    });
    if (rutNorm.length > 1) {
      map.set(rutNorm.slice(0, -1), {
        codEmpresa: row.Cod_Empresa,
        descripcion: row.Descripcion ?? "",
      });
    }
  }
  return map;
}

export function resolveCodEmpresaPorRut(
  rutMap: Map<string, { codEmpresa: string; descripcion: string }>,
  rutRaw: string,
): { codEmpresa: string; descripcion: string } | null {
  const rut = normalizeRut(rutRaw);
  if (!rut) return null;
  return rutMap.get(rut) ?? (rut.length > 1 ? rutMap.get(rut.slice(0, -1)) ?? null : null);
}

export async function resolveDocumentoPorFolio(
  pool: Awaited<ReturnType<typeof getPool>>,
  codEmpresa: string,
  numero: string,
  tipo: string,
): Promise<{ idDocumento: string; fecha: string } | null> {
  const tipoNorm = normalizeTipoFolio(tipo);
  const config = tipoNorm ? TABLE_MAP[tipoNorm] : null;
  if (!config) return null;

  const result = await pool
    .request()
    .input("Numero", sql.NVarChar(20), numero)
    .input("CodEmpresa", sql.UniqueIdentifier, codEmpresa)
    .query(`
      SELECT TOP 1
        ${config.col} AS Id_Documento,
        CONVERT(NVARCHAR(10), Fecha_Emision, 120) AS Fecha_Emision
      FROM ${config.table} WITH (NOLOCK)
      WHERE (Nro_Impreso = TRY_CAST(@Numero AS INT) OR CONVERT(NVARCHAR(20), Nro_Impreso) = @Numero)
        AND Cod_Empresa = @CodEmpresa
      ORDER BY Fecha_Emision DESC, ${config.col} DESC
    `);

  const row = result.recordset[0];
  if (!row) return null;
  return {
    idDocumento: row.Id_Documento as string,
    fecha: row.Fecha_Emision as string,
  };
}

export async function ejecutarReprocesoUno(
  pool: Awaited<ReturnType<typeof getPool>>,
  instance: string,
  adminUsername: string,
  item: ReprocesoDocumentoIn,
  actionName: string,
): Promise<ReprocesoUnoResult> {
  const idDocumento = item.idDocumento?.trim();
  const codEmpresa = item.codEmpresa?.trim();
  const fecha = fechaParaSql(item.fecha ?? "");

  if (!idDocumento || !codEmpresa || !fecha) {
    return {
      ok: false,
      idDocumento: idDocumento || "",
      numero: item.numero,
      tipo: item.tipo,
      error: "Faltan idDocumento, codEmpresa o fecha.",
    };
  }

  try {
    const req = pool.request();
    req.input("Cod_Empresa", sql.UniqueIdentifier, codEmpresa);
    req.input("Fecha", sql.Date, new Date(fecha));
    req.input("Posicion", sql.Int, 1);
    req.input("Procesos", sql.Int, 1);
    req.input("Id_Documento", sql.UniqueIdentifier, idDocumento);
    req.output("Status", sql.Int);

    const result = (await req.execute("dbo.Ges_EnviaVenta_Dyn_optimizado")) as {
      output?: { Status?: number };
      returnValue?: number;
    };

    const status = result.output?.Status ?? result.returnValue ?? -1;
    const ok = status === 1;
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminUsername,
      action: actionName,
      targetType: "VENTA",
      targetName: idDocumento,
      result: ok ? "SUCCESS" : "FAILED",
      detail: ok
        ? "Reproceso ejecutado correctamente."
        : `Procedimiento devolvio estado ${status}.`,
    });

    return {
      ok,
      idDocumento,
      numero: item.numero,
      tipo: item.tipo,
      status,
      mensaje: ok ? "Reproceso ejecutado." : `Procedimiento devolvio estado ${status}.`,
      auditId: auditId ?? undefined,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminUsername,
      action: actionName,
      targetType: "VENTA",
      targetName: idDocumento,
      result: "FAILED",
      detail: `Error interno: ${err.message}`,
    });

    return {
      ok: false,
      idDocumento,
      numero: item.numero,
      tipo: item.tipo,
      error: err.message,
      auditId: auditId ?? undefined,
    };
  }
}

export async function resolverFilasExcel(
  pool: Awaited<ReturnType<typeof getPool>>,
  filas: ExcelFilaIn[],
): Promise<{
  documentos: ReprocesoDocumentoIn[];
  errores: ReprocesoUnoResult[];
}> {
  const rutMap = await loadEmpresaRutMap(pool);
  const documentos: ReprocesoDocumentoIn[] = [];
  const errores: ReprocesoUnoResult[] = [];

  for (const fila of filas) {
    const numero = String(fila.numero ?? "").trim();
    const tipo = normalizeTipoFolio(String(fila.tipo ?? "")) ?? String(fila.tipo ?? "").trim().toUpperCase();
    const rut = normalizeRut(String(fila.rut ?? ""));
    const labelFila = fila.fila ? `Fila ${fila.fila}` : `${tipo} #${numero}`;

    if (!rut || !numero || !tipo) {
      errores.push({
        ok: false,
        idDocumento: "",
        numero,
        tipo,
        rut,
        error: `${labelFila}: faltan rut, folio o tipo.`,
      });
      continue;
    }

    const empresa = resolveCodEmpresaPorRut(rutMap, rut);
    if (!empresa) {
      errores.push({
        ok: false,
        idDocumento: "",
        numero,
        tipo,
        rut,
        error: `${labelFila}: RUT ${rut} no encontrado en Ges_Empresas.`,
      });
      continue;
    }

    const doc = await resolveDocumentoPorFolio(pool, empresa.codEmpresa, numero, tipo);
    if (!doc) {
      errores.push({
        ok: false,
        idDocumento: "",
        numero,
        tipo,
        rut,
        error: `${labelFila}: no se encontro ${tipo} N ${numero} para RUT ${rut}.`,
      });
      continue;
    }

    documentos.push({
      idDocumento: doc.idDocumento,
      codEmpresa: empresa.codEmpresa,
      fecha: doc.fecha,
      numero,
      tipo,
    });
  }

  return { documentos, errores };
}
