import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { normalizarCategoria, agruparFilasEstado2 } from "@/lib/resumenCategorias";
import {
  buildResumenEstadosSqlEstado2,
  buildResumenEstadosSqlRapido,
} from "@/lib/resumenEstadosSql";

export const dynamic = "force-dynamic";

type ResumenRowRapido = {
  Descripcion: string;
  Fecha: string;
  Cod_Empresa: string;
  Tipo: string;
  Estado: number;
  Cantidad: number;
};

type ResumenRowEstado2 = ResumenRowRapido & {
  Categoria: string;
};

const ESTADOS_VALIDOS = [0, 1, 2, 3, 4];

export async function GET(request: NextRequest) {
  const instance = request.headers.get("x-instance") || "default";
  let fechaDesde = request.nextUrl.searchParams.get("fechaDesde")?.trim() ?? "";
  const fechaHastaParam = request.nextUrl.searchParams.get("fechaHasta")?.trim() ?? "";

  if (fechaDesde && !/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde)) {
    const d = new Date(fechaDesde + "T12:00:00");
    if (!Number.isNaN(d.getTime())) {
      fechaDesde = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
  }
  if (!fechaDesde || !/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde)) {
    return NextResponse.json(
      { error: "Falta o formato incorrecto: fechaDesde (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  let fechaHasta = "";
  if (fechaHastaParam) {
    const d = new Date(fechaHastaParam + "T12:00:00");
    if (!Number.isNaN(d.getTime())) {
      fechaHasta = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
  }
  if (fechaHasta && !/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta)) fechaHasta = "";

  const estadosParam = request.nextUrl.searchParams.get("estados")?.trim() ?? "";
  const estadosList = estadosParam
    ? estadosParam.split(",").map((e) => parseInt(e.trim(), 10)).filter((n) => !Number.isNaN(n) && ESTADOS_VALIDOS.includes(n))
    : ESTADOS_VALIDOS;
  const estadosUnicos = [...new Set(estadosList)];
  if (estadosUnicos.length === 0) {
    return NextResponse.json(
      { error: "Indica al menos un estado (0-4)." },
      { status: 400 },
    );
  }

  const empresa = request.nextUrl.searchParams.get("empresa")?.trim() ?? "";
  const subcategorias = request.nextUrl.searchParams.get("subcategorias") === "1";
  const otrosEstados = estadosUnicos.filter((e) => e !== 2);
  const incluyeEstado2 = estadosUnicos.includes(2);

  try {
    const filtroHasta =
      "AND (NULLIF(RTRIM(@fechaHasta), '') IS NULL OR CONVERT(DATE, Cab.Fecha_Emision) <= CAST(@fechaHasta AS DATE))";

    const baseParams = {
      fechaDesde,
      fechaHasta: fechaHasta || "",
      empresa,
    };

    if (!incluyeEstado2) {
      const rows = await query<ResumenRowRapido[]>(
        buildResumenEstadosSqlRapido(filtroHasta),
        { ...baseParams, estados: estadosUnicos.join(",") },
        instance,
      );

      const resumen = (rows ?? []).map((r) => ({
        descripcion: r.Descripcion,
        fecha: r.Fecha,
        codEmpresa: r.Cod_Empresa,
        tipo: r.Tipo,
        estado: r.Estado,
        categoria: normalizarCategoria({ estado: r.Estado }),
        cantidad: r.Cantidad,
      }));

      return NextResponse.json({
        fechaDesde,
        fechaHasta: fechaHasta || null,
        estados: estadosUnicos,
        subcategorias: false,
        resumen,
      });
    }

    const [rapidoRows, estado2Rows] = await Promise.all([
      otrosEstados.length > 0
        ? query<ResumenRowRapido[]>(
            buildResumenEstadosSqlRapido(filtroHasta),
            { ...baseParams, estados: otrosEstados.join(",") },
            instance,
          )
        : Promise.resolve([] as ResumenRowRapido[]),
      query<ResumenRowEstado2[]>(
        buildResumenEstadosSqlEstado2(filtroHasta),
        baseParams,
        instance,
      ),
    ]);

    const estado2Mapeado = (estado2Rows ?? []).map((r) => ({
      descripcion: r.Descripcion,
      fecha: r.Fecha,
      codEmpresa: r.Cod_Empresa,
      tipo: r.Tipo,
      estado: 2 as const,
      categoria: r.Categoria,
      cantidad: r.Cantidad,
    }));

    const resumen = [
      ...(rapidoRows ?? []).map((r) => ({
        descripcion: r.Descripcion,
        fecha: r.Fecha,
        codEmpresa: r.Cod_Empresa,
        tipo: r.Tipo,
        estado: r.Estado,
        categoria: normalizarCategoria({ estado: r.Estado }),
        cantidad: r.Cantidad,
      })),
      ...(subcategorias ? estado2Mapeado : agruparFilasEstado2(estado2Mapeado)),
    ];

    return NextResponse.json({
      fechaDesde,
      fechaHasta: fechaHasta || null,
      estados: estadosUnicos,
      subcategorias: subcategorias && incluyeEstado2,
      resumen,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API resumen-estados]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
