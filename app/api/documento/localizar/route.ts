import { NextRequest, NextResponse } from "next/server";
import { getPool, query, sql } from "@/lib/db";
import { getAdminSessionFromRequest } from "@/lib/auth";
import { insertAdvancedAuditSafe } from "@/lib/advancedControl";
import { resolveInstanceId } from "@/lib/instances";

export const dynamic = "force-dynamic";

type DocInfo = { Cod_Empresa: string; Fecha_Emision: string };

export async function POST(request: NextRequest) {
  const instance = resolveInstanceId(request.headers.get("x-instance"));
  const actionName = "VENTA_LOCALIZAR";

  let body: { numero?: string; codEmpresa?: string; fecha?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON invalido. Esperado: { codEmpresa, fecha } o { numero }." },
      { status: 400 },
    );
  }

  const authTargetName = body.numero?.trim() || body.codEmpresa?.trim() || "UNKNOWN";
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

  let codEmpresa = "";
  let fecha = "";
  let targetName = authTargetName;

  if (body.codEmpresa && body.fecha) {
    codEmpresa = body.codEmpresa;
    fecha = body.fecha;
  } else if (body.numero?.trim()) {
    const numero = body.numero.trim();
    const sqlDoc = `
      SELECT TOP 1 Cod_Empresa, CONVERT(NVARCHAR(10), Fecha_Emision, 120) AS Fecha_Emision
      FROM (
        SELECT Cab.Cod_Empresa, Cab.Fecha_Emision
        FROM Ges_BlvCabecera Cab WITH (NOLOCK)
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        UNION ALL
        SELECT Cab.Cod_Empresa, Cab.Fecha_Emision
        FROM Ges_FcvCabecera Cab WITH (NOLOCK)
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        UNION ALL
        SELECT Cab.Cod_Empresa, Cab.Fecha_Emision
        FROM Ges_NcvCabecera Cab WITH (NOLOCK)
        WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
      ) U
      ORDER BY Fecha_Emision DESC, Cod_Empresa DESC
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
        detail: "Documento no encontrado para localizacion.",
      });

      return NextResponse.json(
        { error: "Documento no encontrado.", numero, auditId },
        { status: 404 },
      );
    }

    codEmpresa = doc.Cod_Empresa;
    fecha = doc.Fecha_Emision;
    targetName = numero;
  } else {
    return NextResponse.json(
      { error: "Indica codEmpresa y fecha, o numero." },
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

    await req.execute("dbo.Ges_Localizacion_Dyn_Prueba");

    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminSession.username,
      action: actionName,
      targetType: "VENTA",
      targetName,
      result: "SUCCESS",
      detail: "Localizacion ejecutada correctamente.",
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Localizacion ejecutada.",
      codEmpresa,
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
      targetName,
      result: "FAILED",
      detail: `Error interno: ${err.message}`,
    });

    console.error("[API documento/localizar]", err.message);
    return NextResponse.json(
      { error: err.message, ok: false, auditId },
      { status: 500 },
    );
  }
}
