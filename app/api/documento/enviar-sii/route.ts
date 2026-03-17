import { NextRequest, NextResponse } from "next/server";
import { getPool, sql } from "@/lib/db";
import { getAdminSessionFromRequest } from "@/lib/auth";
import { insertAdvancedAuditSafe } from "@/lib/advancedControl";
import { resolveInstanceId } from "@/lib/instances";

type FolderResponseBody = {
  Mensaje?: string;
  message?: string;
  raw?: string;
  [key: string]: unknown;
};

function resolveFolderEmpresaId(descripcion: string): string | null {
  const desc = descripcion.toUpperCase();
  const normalized = desc.replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (desc.includes("ANDPAC") || normalized.includes("SALTY CO") || normalized.includes("SALTY")) return "326";
  if (/\bTB\b/.test(desc)) return "191";
  if (desc.includes("NIKE")) return "202";
  if (desc.includes("HIT")) return "221";
  if (/\bTL\b/.test(desc) || desc.includes("THE LINE")) return "201";
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

export async function POST(request: NextRequest) {
  const instance = resolveInstanceId(request.headers.get("x-instance"));
  const actionName = "VENTA_FOLDER";

  let body: {
    numero?: string;
    tipo?: string;
    empresa?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON invalido en cuerpo de solicitud." },
      { status: 400 },
    );
  }

  const numero = String(body?.numero ?? "").trim();
  const tipo = String(body?.tipo ?? "").trim().toUpperCase();
  const empresa = typeof body?.empresa === "string" ? body.empresa.trim() : "";
  const authTargetName = numero || "UNKNOWN";

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

  try {
    if (!numero || !tipo) {
      return NextResponse.json(
        { ok: false, error: "Numero y tipo son obligatorios" },
        { status: 400 },
      );
    }

    const tableMap: Record<string, { table: string; col: string }> = {
      NCV: { table: "Ges_NcvCabecera", col: "Id_NotaCredito" },
      BLE: { table: "Ges_BlvCabecera", col: "Id_Boleta" },
      FCV: { table: "Ges_FcvCabecera", col: "Id_Factura" },
      GDV: { table: "Ges_GdvCabecera", col: "Id_GuiaDespacho" },
    };

    const config = tableMap[tipo];
    if (!config) {
      return NextResponse.json(
        { ok: false, error: `Tipo de documento '${tipo}' no soportado` },
        { status: 400 },
      );
    }

    const pool = await getPool(instance);
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
        userApp: adminSession.username,
        action: actionName,
        targetType: "VENTA",
        targetName: numero,
        result: "FAILED",
        detail: "Documento no encontrado para envio a Folder.",
      });

      return NextResponse.json(
        {
          ok: false,
          error: `No se encontro el documento ${tipo} N ${numero}${empresa ? " para la empresa indicada" : ""}`,
          auditId,
        },
        { status: 404 },
      );
    }

    const documentId = idResult.recordset[0].Id as string;
    const codEmpresa = idResult.recordset[0].Cod_Empresa as string;

    const empresaResult = await pool
      .request()
      .input("CodEmpresa", sql.UniqueIdentifier, codEmpresa)
      .query("SELECT TOP 1 Descripcion FROM Ges_Empresas WITH (NOLOCK) WHERE Cod_Empresa = @CodEmpresa");

    const descripcionEmpresa = String(empresaResult.recordset[0]?.Descripcion ?? "").trim();
    if (!descripcionEmpresa) {
      return NextResponse.json(
        {
          ok: false,
          error: "No fue posible determinar la entidad para mapear Empresa_ID en Folder.",
        },
        { status: 400 },
      );
    }

    const folderEmpresaId = resolveFolderEmpresaId(descripcionEmpresa);
    if (!folderEmpresaId) {
      return NextResponse.json(
        {
          ok: false,
          error: `La entidad '${descripcionEmpresa}' no esta mapeada a Empresa_ID de Folder.`,
        },
        { status: 400 },
      );
    }

    const spResult = await pool
      .request()
      .input("Tipo_Docto", sql.VarChar(10), tipo)
      .input("Id_Documento", sql.UniqueIdentifier, documentId)
      .input("Status", sql.Int, 0)
      .execute("Ges_Ele_XmlEnvioSII_Folder");

    const spRow = spResult.recordset?.[0] ?? {};
    const jsonEnvioSII = (spRow.JsonEnvioSII ?? spRow.JSonEnvioSII) as string | undefined;
    if (!jsonEnvioSII) {
      return NextResponse.json(
        {
          ok: false,
          error: "El procedimiento no devolvio un JSON valido (JsonEnvioSII/JSonEnvioSII).",
          debug: spRow || "Registro vacio",
        },
        { status: 500 },
      );
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
      userApp: adminSession.username,
      action: actionName,
      targetType: "VENTA",
      targetName: documentId,
      result: folderOk ? "SUCCESS" : "FAILED",
      detail: folderOk ? mensaje : `Folder rechazo la solicitud: ${mensaje}`,
    });

    return NextResponse.json({
      ok: folderOk,
      status: folderResponse.status,
      data: folderData,
      mensaje,
      folderBusinessSuccess,
      estadoSiiActualizado,
      estadoSiiActual,
      estadoSyncError,
      auditId,
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

