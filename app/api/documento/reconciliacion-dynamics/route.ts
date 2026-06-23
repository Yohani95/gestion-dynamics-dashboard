import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/auth";
import { insertAdvancedAuditSafe } from "@/lib/advancedControl";
import { listarDocumentosAuditor, type RangoFechasAuditor } from "@/lib/auditorDynamics";
import { getDynamicsEnvStatus } from "@/lib/dynamicsEnv";
import {
  RECONCILIACION_APLICAR_MAX,
  RECONCILIACION_LOTE,
  aplicarReconciliacionLote,
  auditarParaReconciliacion,
} from "@/lib/reconciliacionDynamics";
import { resolveInstanceId } from "@/lib/instances";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseRangoFechas(searchParams: URLSearchParams): RangoFechasAuditor | { error: string } {
  const desde = searchParams.get("fechaDesde")?.trim() ?? "";
  const hasta = searchParams.get("fechaHasta")?.trim() ?? "";
  const fechaRe = /^\d{4}-\d{2}-\d{2}$/;

  if (!desde || !hasta) {
    return { error: "Indique fechaDesde y fechaHasta (YYYY-MM-DD)." };
  }
  if (!fechaRe.test(desde) || !fechaRe.test(hasta)) {
    return { error: "Formato de fecha inválido. Use YYYY-MM-DD." };
  }
  if (desde > hasta) {
    return { error: "La fecha desde no puede ser posterior a la fecha hasta." };
  }

  return { desde, hasta };
}

export async function GET(request: NextRequest) {
  const instance = resolveInstanceId(request.headers.get("x-instance"));
  const empresa = request.nextUrl.searchParams.get("empresa")?.trim() ?? "";
  const tipo = request.nextUrl.searchParams.get("tipo")?.trim().toUpperCase() ?? "";
  const numero = request.nextUrl.searchParams.get("numero")?.trim() ?? "";
  const estadoSII = request.nextUrl.searchParams.get("estadoSII")?.trim() ?? "";
  const soloTimbrados = request.nextUrl.searchParams.get("soloTimbrados") !== "0";
  const soloCandidatos = request.nextUrl.searchParams.get("soloCandidatos") === "1";
  const estadoObjetivo = Math.min(
    4,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("estadoObjetivo") ?? "3", 10) || 3),
  );
  const estadoEnvioMax = Math.min(
    estadoObjetivo - 1,
    Math.max(
      0,
      parseInt(
        request.nextUrl.searchParams.get("estadoEnvioMax") ?? String(estadoObjetivo - 1),
        10,
      ) || estadoObjetivo - 1,
    ),
  );
  const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(
    20,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? String(RECONCILIACION_LOTE), 10) || RECONCILIACION_LOTE),
  );
  const modo = request.nextUrl.searchParams.get("modo")?.trim() ?? "auditar";

  const rango = parseRangoFechas(request.nextUrl.searchParams);
  if ("error" in rango) {
    return NextResponse.json({ error: rango.error }, { status: 400 });
  }

  const bcStatus = getDynamicsEnvStatus();
  if (!bcStatus.configurado) {
    return NextResponse.json(
      {
        error: "Business Central no está configurado. Revise DYNAMICS_* en .env.local.",
        detalle: bcStatus.detalle,
      },
      { status: 503 },
    );
  }

  try {
    if (modo === "conteo") {
      const { total } = await listarDocumentosAuditor(rango, instance, {
        empresa,
        tipo,
        numero,
        estadoSII,
        estadoEnvioMax,
        soloTimbrados,
        offset: 0,
        limit: 1,
      });
      return NextResponse.json({
        fechaDesde: rango.desde,
        fechaHasta: rango.hasta,
        total,
        estadoObjetivo,
        estadoEnvioMax,
      });
    }

    const { documentos, total } = await listarDocumentosAuditor(rango, instance, {
      empresa,
      tipo,
      numero,
      estadoSII,
      estadoEnvioMax,
      soloTimbrados,
      offset,
      limit,
    });

    const items = await auditarParaReconciliacion(documentos, instance, estadoObjetivo);
    const resultados = soloCandidatos ? items.filter((i) => i.candidato) : items;
    const candidatos = items.filter((i) => i.candidato).length;

    return NextResponse.json({
      fechaDesde: rango.desde,
      fechaHasta: rango.hasta,
      total,
      offset,
      limit,
      procesados: documentos.length,
      candidatosEnLote: candidatos,
      estadoObjetivo,
      estadoEnvioMax,
      resultados,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API documento/reconciliacion-dynamics GET]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

type AplicarBody = {
  estadoObjetivo?: number;
  documentos?: {
    idDocumento: string;
    tipo: string;
    numero: number;
    idBcDynamics?: string | null;
  }[];
};

export async function POST(request: NextRequest) {
  const instance = resolveInstanceId(request.headers.get("x-instance"));
  const actionName = "VENTA_RECONCILIAR_DYNAMICS";

  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: null,
      action: actionName,
      targetType: "VENTA",
      targetName: "BATCH",
      result: "DENIED",
      detail: "Accion denegada: sesion de administrador requerida.",
    });
    return NextResponse.json(
      { ok: false, error: "Sesión de administrador requerida.", auditId },
      { status: 401 },
    );
  }

  if (adminSession.role !== "ADMIN") {
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminSession.username,
      action: actionName,
      targetType: "VENTA",
      targetName: "BATCH",
      result: "DENIED",
      detail: "Accion denegada: rol sin privilegios de administrador.",
    });
    return NextResponse.json(
      { ok: false, error: "El usuario no tiene permisos para ejecutar esta acción.", auditId },
      { status: 403 },
    );
  }

  let body: AplicarBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const estadoObjetivo = Math.min(4, Math.max(1, body.estadoObjetivo ?? 3));
  const documentos = body.documentos ?? [];

  if (documentos.length === 0) {
    return NextResponse.json({ ok: false, error: "No hay documentos para aplicar." }, { status: 400 });
  }
  if (documentos.length > RECONCILIACION_APLICAR_MAX) {
    return NextResponse.json(
      { ok: false, error: `Máximo ${RECONCILIACION_APLICAR_MAX} documentos por lote.` },
      { status: 400 },
    );
  }

  try {
    const resultados = await aplicarReconciliacionLote(
      instance,
      documentos.map((d) => ({
        idDocumento: d.idDocumento,
        tipo: d.tipo,
        numero: d.numero,
        idBcDynamics: d.idBcDynamics ?? null,
        nuevoEstado: estadoObjetivo,
      })),
    );

    const okCount = resultados.filter((r) => r.ok).length;
    const failCount = resultados.length - okCount;

    await insertAdvancedAuditSafe({
      instance,
      userApp: adminSession.username,
      action: actionName,
      targetType: "VENTA",
      targetName: `LOTE_${resultados.length}`,
      result: failCount === 0 ? "SUCCESS" : okCount > 0 ? "SUCCESS" : "FAILED",
      detail: `Estado objetivo ${estadoObjetivo}: ${okCount} OK, ${failCount} fallos.`,
    });

    return NextResponse.json({
      ok: failCount === 0,
      estadoObjetivo,
      procesados: resultados.length,
      exitosos: okCount,
      fallidos: failCount,
      resultados,
      mensaje:
        failCount === 0
          ? `${okCount} documento(s) sincronizado(s) a estado ${estadoObjetivo}.`
          : `${okCount} OK, ${failCount} con error.`,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API documento/reconciliacion-dynamics POST]", err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
