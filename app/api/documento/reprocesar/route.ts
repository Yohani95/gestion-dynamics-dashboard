import { NextRequest, NextResponse } from "next/server";
import { getPool, query, sql } from "@/lib/db";
import { getAdminSessionFromRequest } from "@/lib/auth";
import { insertAdvancedAuditSafe } from "@/lib/advancedControl";
import { resolveInstanceId } from "@/lib/instances";

export const dynamic = "force-dynamic";

type DocInfo = {
  Id_Documento: string;
  Cod_Empresa: string;
  Fecha_Emision: string;
  Tipo: string;
};

export async function POST(request: NextRequest) {
  const instance = resolveInstanceId(request.headers.get("x-instance"));
  const actionName = "VENTA_REPROCESAR";

  let body: { numero?: string; idDocumento?: string; codEmpresa?: string; fecha?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON invalido. Esperado: { numero } o { idDocumento, codEmpresa, fecha }." },
      { status: 400 },
    );
  }

  const authTargetName = body.numero?.trim() || body.idDocumento?.trim() || "UNKNOWN";
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

  const numero = body.numero?.trim();
  let idDocumento = "";
  let codEmpresa = "";
  let fecha = "";

  if (body.idDocumento && body.codEmpresa && body.fecha) {
    idDocumento = body.idDocumento;
    codEmpresa = body.codEmpresa;
    fecha = body.fecha;
  } else if (numero) {
    const sqlDoc = `
      SELECT TOP 1 Id_Documento, Cod_Empresa, CONVERT(NVARCHAR(10), Fecha_Emision, 120) AS Fecha_Emision, Tipo FROM (
        SELECT Cab.Id_Boleta AS Id_Documento, Cab.Cod_Empresa, Cab.Fecha_Emision, 'BLE' AS Tipo
        FROM Ges_BlvCabecera Cab WITH (NOLOCK)
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        UNION ALL
        SELECT Cab.Id_Factura, Cab.Cod_Empresa, Cab.Fecha_Emision, 'FCV'
        FROM Ges_FcvCabecera Cab WITH (NOLOCK)
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        UNION ALL
        SELECT Cab.Id_NotaCredito, Cab.Cod_Empresa, Cab.Fecha_Emision, 'NCV'
        FROM Ges_NcvCabecera Cab WITH (NOLOCK)
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
      ) U
      ORDER BY Fecha_Emision DESC, Tipo ASC, Id_Documento DESC
    `;

    const rows = await query<DocInfo[]>(sqlDoc, { numero }, instance);
    const doc = rows?.[0];
    if (!doc) {
      const auditId = await insertAdvancedAuditSafe({
        instance,
        userApp: adminSession.username,
        action: actionName,
        targetType: "VENTA",
        targetName: numero,
        result: "FAILED",
        detail: "Documento no encontrado para reproceso.",
      });

      return NextResponse.json(
        { error: "Documento no encontrado.", numero, auditId },
        { status: 404 },
      );
    }

    idDocumento = doc.Id_Documento;
    codEmpresa = doc.Cod_Empresa;
    fecha = doc.Fecha_Emision;
  } else {
    return NextResponse.json(
      { error: "Indica numero o (idDocumento, codEmpresa, fecha)." },
      { status: 400 },
    );
  }

  try {
    const pool = await getPool(instance);
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
      userApp: adminSession.username,
      action: actionName,
      targetType: "VENTA",
      targetName: idDocumento,
      result: ok ? "SUCCESS" : "FAILED",
      detail: ok
        ? "Reproceso ejecutado correctamente."
        : `Procedimiento devolvio estado ${status}.`,
    });

    return NextResponse.json({
      ok,
      status,
      mensaje: ok ? "Reproceso ejecutado." : `Procedimiento devolvio estado ${status}.`,
      idDocumento,
      fecha,
      auditId,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminSession.username,
      action: actionName,
      targetType: "VENTA",
      targetName: idDocumento || authTargetName,
      result: "FAILED",
      detail: `Error interno: ${err.message}`,
    });

    console.error("[API documento/reprocesar]", err.message);
    return NextResponse.json(
      { error: err.message, ok: false, auditId },
      { status: 500 },
    );
  }
}
