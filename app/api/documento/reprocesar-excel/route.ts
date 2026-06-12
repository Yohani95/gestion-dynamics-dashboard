import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminSessionFromRequest } from "@/lib/auth";
import { insertAdvancedAuditSafe } from "@/lib/advancedControl";
import { resolveInstanceId } from "@/lib/instances";
import {
  BULK_REPROCESO_MAX,
  ejecutarReprocesoUno,
  resolverFilasExcel,
  type ExcelFilaIn,
  type ReprocesoUnoResult,
} from "@/lib/reprocesoVenta";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const instance = resolveInstanceId(request.headers.get("x-instance"));
  const actionName = "VENTA_REPROCESAR_EXCEL";

  let body: { filas?: ExcelFilaIn[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON invalido. Esperado: { filas: [{ rut, numero, tipo }] }." },
      { status: 400 },
    );
  }

  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: null,
      action: actionName,
      targetType: "VENTA",
      targetName: "BULK_EXCEL",
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
      targetName: "BULK_EXCEL",
      result: "DENIED",
      detail: "Accion denegada: rol sin privilegios de administrador.",
    });

    return NextResponse.json(
      { ok: false, error: "El usuario no tiene permisos para ejecutar acciones.", auditId },
      { status: 403 },
    );
  }

  const filas = Array.isArray(body.filas) ? body.filas : [];
  if (!filas.length) {
    return NextResponse.json(
      { ok: false, error: "Debe enviar al menos una fila en filas[]." },
      { status: 400 },
    );
  }

  if (filas.length > BULK_REPROCESO_MAX) {
    return NextResponse.json(
      { ok: false, error: `Masivo Excel: maximo ${BULK_REPROCESO_MAX} filas por solicitud.` },
      { status: 400 },
    );
  }

  try {
    const pool = await getPool(instance);
    const { documentos, errores: erroresResolucion } = await resolverFilasExcel(pool, filas);
    const resultados: ReprocesoUnoResult[] = [...erroresResolucion];

    for (const item of documentos) {
      const r = await ejecutarReprocesoUno(pool, instance, adminSession.username, item, actionName);
      resultados.push({ ...r, rut: filas.find((f) => String(f.numero) === item.numero)?.rut });
    }

    const exitosos = resultados.filter((r) => r.ok).length;
    const fallidos = resultados.length - exitosos;

    return NextResponse.json({
      ok: fallidos === 0,
      masivo: true,
      origen: "excel",
      total: resultados.length,
      exitosos,
      fallidos,
      resueltos: documentos.length,
      resultados,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[API documento/reprocesar-excel]", err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
