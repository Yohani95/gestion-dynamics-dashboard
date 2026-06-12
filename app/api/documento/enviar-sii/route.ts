import { NextRequest, NextResponse } from "next/server";
import { getPool, sql } from "@/lib/db";
import { getAdminSessionFromRequest } from "@/lib/auth";
import { insertAdvancedAuditSafe } from "@/lib/advancedControl";
import { getInstanceMeta, resolveInstanceId, type InstanceId } from "@/lib/instances";

type FolderResponseBody = {
  Mensaje?: string;
  message?: string;
  raw?: string;
  [key: string]: unknown;
};

const BULK_ENVIO_MAX = 40;

function readFolderEmpresaIdFromEnv(suffix: string): string | null {
  const v = process.env[`FOLDER_EMPRESA_ID${suffix}`]?.trim();
  return v && /^\d+$/.test(v) ? v : null;
}

function readFolderEmpresaIdDefault(): string {
  return readFolderEmpresaIdFromEnv("") ?? "201";
}

function readFolderEmpresaIdByAlias(alias: string, fallback: string): string {
  const v = process.env[`FOLDER_EMPRESA_ID_${alias}`]?.trim();
  return v && /^\d+$/.test(v) ? v : fallback;
}

function readFolderEmpresaIdTecnoBuy(suffix: string): string {
  const fromInstance = suffix ? readFolderEmpresaIdFromEnv(suffix) : null;
  return fromInstance ?? readFolderEmpresaIdFromEnv("_tecnobuy") ?? "191";
}

/** Normaliza GUID para comparar claves de FOLDER_EMPRESA_IDS_JSON */
function normalizeCodEmpresaKey(value: string): string {
  return value.replace(/[{}]/g, "").trim().toLowerCase();
}

/**
 * Mapeo explícito Cod_Empresa (Ges_Empresas) → Empresa_ID numérico en Folder.
 * Útil cuando el nombre coincide con varias reglas pero el RUT del XML es de una razón distinta
 * (evita "Rut de Compañía incorrecto" al usar el ID de otra compañía en el header).
 *
 * .env.local ejemplo:
 * FOLDER_EMPRESA_IDS_JSON={"107bf720-2b02-4a89-8bcf-796cba00439f":"123"}
 */
function readFolderEmpresaIdByCodEmpresa(codEmpresa: string): string | null {
  const raw = process.env.FOLDER_EMPRESA_IDS_JSON?.trim();
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const target = normalizeCodEmpresaKey(codEmpresa);
    for (const [k, v] of Object.entries(obj)) {
      if (normalizeCodEmpresaKey(k) !== target) continue;
      const id = typeof v === "number" ? String(v) : String(v ?? "").trim();
      return /^\d+$/.test(id) ? id : null;
    }
  } catch {
    return null;
  }
  return null;
}

function readNumericId(value: unknown): string | null {
  const id = typeof value === "number" ? String(value) : String(value ?? "").trim();
  return /^\d+$/.test(id) ? id : null;
}

function extractFolderEmpresaIdFromPayload(
  spRow: Record<string, unknown>,
  jsonEnvioSII: string,
): string | null {
  for (const key of ["Empresa_ID", "IdEmpresa", "EmpresaId"]) {
    const fromSp = readNumericId(spRow[key]);
    if (fromSp) return fromSp;
  }

  try {
    const json = JSON.parse(jsonEnvioSII) as Record<string, unknown>;
    const encabezado =
      json.Encabezado && typeof json.Encabezado === "object"
        ? (json.Encabezado as Record<string, unknown>)
        : null;
    const emisor =
      encabezado?.Emisor && typeof encabezado.Emisor === "object"
        ? (encabezado.Emisor as Record<string, unknown>)
        : json.Emisor && typeof json.Emisor === "object"
          ? (json.Emisor as Record<string, unknown>)
          : null;

    for (const value of [
      json.Empresa_ID,
      json.IdEmpresa,
      json.EmpresaId,
      encabezado?.Empresa_ID,
      encabezado?.IdEmpresa,
      emisor?.Empresa_ID,
      emisor?.IdEmpresa,
    ]) {
      const fromJson = readNumericId(value);
      if (fromJson) return fromJson;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveFolderEmpresaIdForDocument(
  codEmpresa: string,
  descripcion: string,
  instanceId: InstanceId,
  spRow?: Record<string, unknown>,
  jsonEnvioSII?: string,
): string | null {
  const byGuid = readFolderEmpresaIdByCodEmpresa(codEmpresa);
  if (byGuid) return byGuid;

  if (spRow && jsonEnvioSII) {
    const fromPayload = extractFolderEmpresaIdFromPayload(spRow, jsonEnvioSII);
    if (fromPayload) return fromPayload;
  }

  return resolveFolderEmpresaId(descripcion, instanceId);
}

function resolveFolderEmpresaId(descripcion: string, instanceId: InstanceId): string | null {
  const desc = descripcion.toUpperCase();
  const normalized = desc.replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const suffix = getInstanceMeta(instanceId).envSuffix;

  if (desc.includes("ANDPAC") || normalized.includes("SALTY CO") || normalized.includes("SALTY")) {
    return readFolderEmpresaIdFromEnv("_andpac") ?? "326";
  }
  if (/\bTB\b/.test(desc)) return readFolderEmpresaIdTecnoBuy(suffix);
  if (desc.includes("NIKE")) return readFolderEmpresaIdByAlias("NIKE", "202");
  if (desc.includes("HIT")) return readFolderEmpresaIdByAlias("HIT", "221");
  // CISA / Comercializadora antes que TL: evita usar 201 cuando el nombre incluye "The Line"
  if (/\bCISA\b/.test(desc) || desc.includes("COMERCIALIZADORA")) {
    return readFolderEmpresaIdByAlias("CISA", "202");
  }
  // TL e International comparten Empresa_ID en Folder (201)
  if (desc.includes("INTERNATIONAL") || /\bTL\b/.test(desc) || desc.includes("THE LINE")) {
    return readFolderEmpresaIdDefault();
  }
  // TecnoBuy: el nombre de la entidad suele venir como "TECNOBUY" o "TECNO..."
  if (desc.includes("TECNOBUY") || /\bTECNO\b/.test(normalized) || normalized.startsWith("TECNO ")) {
    return readFolderEmpresaIdTecnoBuy(suffix);
  }

  if (instanceId === "tecnobuy") {
    return readFolderEmpresaIdTecnoBuy(suffix);
  }

  return null;
}

function getFolderMessage(folderData: FolderResponseBody | null, responseOk: boolean): string {
  return (
    folderData?.Mensaje ??
    folderData?.message ??
    (responseOk ? "Envio exitoso" : "Error en la API de Folder ERP")
  );
}

function isFolderBusinessSuccess(message: string): boolean {
  return /ya se encuentra facturad[oa]/i.test(message);
}

async function markDocumentoTimbrado(pool: Awaited<ReturnType<typeof getPool>>, documentId: string) {
  await pool
    .request()
    .input("IdDocumento", sql.UniqueIdentifier, documentId)
    .query(`
      UPDATE dbo.Ges_EleDocSii
      SET Estado = 2
      WHERE Id_Documento = @IdDocumento;
    `);

  const statusResult = await pool
    .request()
    .input("IdDocumento", sql.UniqueIdentifier, documentId)
    .query<{ Estado: number | null }>(`
      SELECT TOP 1 Estado
      FROM dbo.Ges_EleDocSii WITH (NOLOCK)
      WHERE Id_Documento = @IdDocumento;
    `);

  const estadoActual = statusResult.recordset[0]?.Estado ?? null;
  return {
    estadoActual,
    estadoActualizado: estadoActual === 2,
  };
}

type EnviarItem = { numero: string; tipo: string; empresa?: string };

type SingleProcessResult = {
  ok: boolean;
  numero: string;
  tipo: string;
  status?: number;
  data?: FolderResponseBody | null;
  mensaje?: string;
  folderBusinessSuccess?: boolean;
  estadoSiiActualizado?: boolean;
  estadoSiiActual?: number | null;
  estadoSyncError?: string | null;
  error?: string;
  auditId?: number;
  debug?: unknown;
};

async function procesarEnvioFolderUno(
  pool: Awaited<ReturnType<typeof getPool>>,
  instance: InstanceId,
  adminUsername: string,
  item: EnviarItem,
  actionName: string,
): Promise<SingleProcessResult> {
  const numero = String(item.numero ?? "").trim();
  const tipo = String(item.tipo ?? "").trim().toUpperCase();
  const empresa = typeof item.empresa === "string" ? item.empresa.trim() : "";

  if (!numero || !tipo) {
    return { ok: false, numero, tipo, error: "Numero y tipo son obligatorios" };
  }

  const tableMap: Record<string, { table: string; col: string }> = {
    NCV: { table: "Ges_NcvCabecera", col: "Id_NotaCredito" },
    BLE: { table: "Ges_BlvCabecera", col: "Id_Boleta" },
    FCV: { table: "Ges_FcvCabecera", col: "Id_Factura" },
    GDV: { table: "Ges_GdvCabecera", col: "Id_GuiaDespacho" },
  };

  const config = tableMap[tipo];
  if (!config) {
    return { ok: false, numero, tipo, error: `Tipo de documento '${tipo}' no soportado` };
  }

  const idResult = await pool
    .request()
    .input("Numero", sql.NVarChar(20), numero)
    .input("Empresa", sql.NVarChar(50), empresa)
    .query(`
        SELECT TOP 1 ${config.col} AS Id, Cod_Empresa
        FROM ${config.table} WITH (NOLOCK)
        WHERE (Nro_Impreso = TRY_CAST(@Numero AS INT) OR CONVERT(NVARCHAR(20), Nro_Impreso) = @Numero)
          AND (NULLIF(@Empresa, '') IS NULL OR Cod_Empresa = CAST(NULLIF(@Empresa, '') AS UNIQUEIDENTIFIER))
        ORDER BY Fecha_Emision DESC, ${config.col} DESC
      `);

  if (idResult.recordset.length === 0) {
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminUsername,
      action: actionName,
      targetType: "VENTA",
      targetName: numero,
      result: "FAILED",
      detail: "Documento no encontrado para envio a Folder.",
    });

    return {
      ok: false,
      numero,
      tipo,
      error: `No se encontro el documento ${tipo} N ${numero}${empresa ? " para la empresa indicada" : ""}`,
      auditId: auditId ?? undefined,
    };
  }

  const documentId = idResult.recordset[0].Id as string;
  const codEmpresa = idResult.recordset[0].Cod_Empresa as string;

  const empresaResult = await pool
    .request()
    .input("CodEmpresa", sql.UniqueIdentifier, codEmpresa)
    .query("SELECT TOP 1 Descripcion FROM Ges_Empresas WITH (NOLOCK) WHERE Cod_Empresa = @CodEmpresa");

  const descripcionEmpresa = String(empresaResult.recordset[0]?.Descripcion ?? "").trim();
  if (!descripcionEmpresa) {
    return {
      ok: false,
      numero,
      tipo,
      error: "No fue posible determinar la entidad para mapear Empresa_ID en Folder.",
    };
  }

  const spResult = await pool
    .request()
    .input("Tipo_Docto", sql.VarChar(10), tipo)
    .input("Id_Documento", sql.UniqueIdentifier, documentId)
    .input("Status", sql.Int, 0)
    .execute("Ges_Ele_XmlEnvioSII_Folder");

  const spRow = (spResult.recordset?.[0] ?? {}) as Record<string, unknown>;
  const jsonEnvioSII = (spRow.JsonEnvioSII ?? spRow.JSonEnvioSII) as string | undefined;
  if (!jsonEnvioSII) {
    return {
      ok: false,
      numero,
      tipo,
      error: "El procedimiento no devolvio un JSON valido (JsonEnvioSII/JSonEnvioSII).",
      debug: spRow || "Registro vacio",
    };
  }

  const folderEmpresaId = resolveFolderEmpresaIdForDocument(
    codEmpresa,
    descripcionEmpresa,
    instance,
    spRow,
    jsonEnvioSII,
  );
  if (!folderEmpresaId) {
    const hintCisa =
      /\bCISA\b/i.test(descripcionEmpresa) || /COMERCIALIZADORA/i.test(descripcionEmpresa)
        ? " Configure FOLDER_EMPRESA_ID_CISA o FOLDER_EMPRESA_IDS_JSON en .env.local con el Empresa_ID de Folder para esta entidad."
        : "";
    return {
      ok: false,
      numero,
      tipo,
      error: `La entidad '${descripcionEmpresa}' no esta mapeada a Empresa_ID de Folder.${hintCisa}`,
    };
  }

  const folderResponse = await fetch("https://api.foldererp.com/api/BoletaElectronica/Save", {
    method: "POST",
    headers: {
      Empresa_ID: folderEmpresaId,
      Usuario_ID: "theline@thelinegroup.cl",
      Tocken: "32dee7daf6764634810f73bd595fae6b",
      "Content-Type": "application/json",
    },
    body: jsonEnvioSII,
  });

  const rawResponse = await folderResponse.text();
  let folderData: FolderResponseBody | null = null;
  try {
    folderData = rawResponse ? (JSON.parse(rawResponse) as FolderResponseBody) : null;
  } catch {
    folderData = { raw: rawResponse };
  }

  const mensaje = getFolderMessage(folderData, folderResponse.ok);
  const folderBusinessSuccess = isFolderBusinessSuccess(mensaje);
  const folderOk = folderResponse.ok || folderBusinessSuccess;

  let estadoSiiActualizado = false;
  let estadoSiiActual: number | null = null;
  let estadoSyncError: string | null = null;

  if (folderOk) {
    try {
      const syncStatus = await markDocumentoTimbrado(pool, documentId);
      estadoSiiActualizado = syncStatus.estadoActualizado;
      estadoSiiActual = syncStatus.estadoActual;
      if (!estadoSiiActualizado) {
        estadoSyncError =
          "Folder respondio OK, pero no se pudo confirmar Estado_SII=2 en Ges_EleDocSii.";
      }
    } catch (syncError) {
      const syncMessage = syncError instanceof Error ? syncError.message : String(syncError);
      estadoSyncError = `Folder respondio OK, pero fallo la actualizacion local de Estado_SII: ${syncMessage}`;
    }
  }

  const auditId = await insertAdvancedAuditSafe({
    instance,
    userApp: adminUsername,
    action: actionName,
    targetType: "VENTA",
    targetName: documentId,
    result: folderOk ? "SUCCESS" : "FAILED",
    detail: folderOk ? mensaje : `Folder rechazo la solicitud: ${mensaje}`,
  });

  return {
    ok: folderOk,
    numero,
    tipo,
    status: folderResponse.status,
    data: folderData,
    mensaje,
    folderBusinessSuccess,
    estadoSiiActualizado,
    estadoSiiActual,
    estadoSyncError,
    auditId: auditId ?? undefined,
  };
}

export async function POST(request: NextRequest) {
  const instance = resolveInstanceId(request.headers.get("x-instance"));
  const actionName = "VENTA_FOLDER";

  let body: {
    numero?: string;
    tipo?: string;
    empresa?: string;
    documentos?: EnviarItem[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON invalido en cuerpo de solicitud." },
      { status: 400 },
    );
  }

  const authTargetName = String(body?.numero ?? "").trim() || "BULK";
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: null,
      action: actionName,
      targetType: "VENTA",
      targetName: authTargetName,
      result: "DENIED",
      detail: "Accion denegada: sesion de administrador requerida.",
    });

    return NextResponse.json(
      { ok: false, error: "Sesion de administrador requerida.", auditId },
      { status: 401 },
    );
  }

  if (adminSession.role !== "ADMIN") {
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminSession.username,
      action: actionName,
      targetType: "VENTA",
      targetName: authTargetName,
      result: "DENIED",
      detail: "Accion denegada: rol sin privilegios de administrador.",
    });

    return NextResponse.json(
      {
        ok: false,
        error: "El usuario no tiene permisos para ejecutar acciones.",
        auditId,
      },
      { status: 403 },
    );
  }

  const documentos = Array.isArray(body.documentos) ? body.documentos : null;

  try {
    if (documentos && documentos.length > 0) {
      if (documentos.length > BULK_ENVIO_MAX) {
        return NextResponse.json(
          {
            ok: false,
            error: `Masivo: maximo ${BULK_ENVIO_MAX} documentos por solicitud.`,
          },
          { status: 400 },
        );
      }

      const pool = await getPool(instance);
      const resultados: SingleProcessResult[] = [];

      for (const item of documentos) {
        try {
          const r = await procesarEnvioFolderUno(pool, instance, adminSession.username, item, actionName);
          resultados.push(r);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          resultados.push({
            ok: false,
            numero: String(item?.numero ?? ""),
            tipo: String(item?.tipo ?? "").toUpperCase(),
            error: msg,
          });
        }
      }

      const exitosos = resultados.filter((r) => r.ok).length;
      const fallidos = resultados.length - exitosos;

      return NextResponse.json({
        ok: fallidos === 0,
        masivo: true,
        total: resultados.length,
        exitosos,
        fallidos,
        resultados,
      });
    }

    const numero = String(body?.numero ?? "").trim();
    const tipo = String(body?.tipo ?? "").trim().toUpperCase();
    const empresa = typeof body?.empresa === "string" ? body.empresa.trim() : "";

    if (!numero || !tipo) {
      return NextResponse.json(
        { ok: false, error: "Numero y tipo son obligatorios (o envie documentos[] para masivo)." },
        { status: 400 },
      );
    }

    const pool = await getPool(instance);
    const r = await procesarEnvioFolderUno(
      pool,
      instance,
      adminSession.username,
      { numero, tipo, empresa },
      actionName,
    );

    // Errores previos al llamado a Folder: mantener códigos HTTP; rechazo de Folder sigue siendo 200 + ok:false
    if (!r.ok && r.error) {
      if (r.error.startsWith("No se encontro")) {
        return NextResponse.json(
          { ok: false, error: r.error, auditId: r.auditId },
          { status: 404 },
        );
      }
      if (r.debug != null) {
        return NextResponse.json(
          { ok: false, error: r.error, auditId: r.auditId, debug: r.debug },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { ok: false, error: r.error, auditId: r.auditId },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: r.ok,
      status: r.status,
      data: r.data,
      mensaje: r.mensaje,
      folderBusinessSuccess: r.folderBusinessSuccess,
      estadoSiiActualizado: r.estadoSiiActualizado,
      estadoSiiActual: r.estadoSiiActual,
      estadoSyncError: r.estadoSyncError,
      auditId: r.auditId,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminSession.username,
      action: actionName,
      targetType: "VENTA",
      targetName: authTargetName,
      result: "FAILED",
      detail: `Error interno: ${err.message}`,
    });

    console.error("[API documento/enviar-sii]", err.message);
    return NextResponse.json(
      {
        ok: false,
        error: err.message || "Error interno al procesar el envio",
        auditId,
      },
      { status: 500 },
    );
  }
}
