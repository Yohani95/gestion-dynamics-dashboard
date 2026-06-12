import { NextRequest, NextResponse } from "next/server";
import {
  AUDITOR_DYNAMICS_LOTE,
  auditarLoteDocumentos,
  listarDocumentosAuditor,
  type RangoFechasAuditor,
} from "@/lib/auditorDynamics";
import { getDynamicsEnvStatus } from "@/lib/dynamicsEnv";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseRangoFechas(searchParams: URLSearchParams): RangoFechasAuditor | { error: string } {
  const desde = searchParams.get("fechaDesde")?.trim() ?? searchParams.get("fecha")?.trim() ?? "";
  const hasta = searchParams.get("fechaHasta")?.trim() ?? searchParams.get("fecha")?.trim() ?? "";
  const fechaRe = /^\d{4}-\d{2}-\d{2}$/;

  if (!desde || !hasta) {
    return { error: "Indique fechaDesde y fechaHasta (YYYY-MM-DD), o fecha para un solo día." };
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
  const instance = request.headers.get("x-instance") || "default";
  const empresa = request.nextUrl.searchParams.get("empresa")?.trim() ?? "";
  const tipo = request.nextUrl.searchParams.get("tipo")?.trim().toUpperCase() ?? "";
  const numero = request.nextUrl.searchParams.get("numero")?.trim() ?? "";
  const estadoSII = request.nextUrl.searchParams.get("estadoSII")?.trim() ?? "";
  const estadoEnvio = request.nextUrl.searchParams.get("estadoEnvio")?.trim() ?? "";
  const soloTimbrados = request.nextUrl.searchParams.get("soloTimbrados") !== "0";
  const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(
    20,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? String(AUDITOR_DYNAMICS_LOTE), 10) || AUDITOR_DYNAMICS_LOTE),
  );
  const modo = request.nextUrl.searchParams.get("modo")?.trim() ?? "auditar";

  if (modo === "config") {
    const status = getDynamicsEnvStatus();
    return NextResponse.json(
      { configurado: status.configurado, detalle: status.detalle },
      { status: status.configurado ? 200 : 503 },
    );
  }

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
    const { documentos, total } = await listarDocumentosAuditor(rango, instance, {
      empresa,
      tipo,
      numero,
      estadoSII,
      estadoEnvio,
      soloTimbrados,
      offset,
      limit,
    });

    if (modo === "conteo") {
      return NextResponse.json({
        fechaDesde: rango.desde,
        fechaHasta: rango.hasta,
        total,
        empresa: empresa || null,
        tipo: tipo || null,
        soloTimbrados,
      });
    }

    const resultados = modo === "lista" ? [] : await auditarLoteDocumentos(documentos, instance);

    return NextResponse.json({
      fechaDesde: rango.desde,
      fechaHasta: rango.hasta,
      total,
      offset,
      limit,
      procesados: documentos.length,
      empresa: empresa || null,
      tipo: tipo || null,
      soloTimbrados,
      resultados,
      documentos: modo === "lista" ? documentos : undefined,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API documento/auditor-dynamics]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
