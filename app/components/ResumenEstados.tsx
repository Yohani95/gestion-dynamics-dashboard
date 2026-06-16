"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Filter, Calendar, Download, RefreshCw, ChevronRight,
  Building2, FileCheck2, Search, ArrowUpRight, ListChecks,
  AlertCircle, CheckCircle2, Printer
} from "lucide-react";
import { downloadXlsxTable, triggerPrint } from "@/lib/exportUtils";
import {
  buildResumenPivot,
  pivotToXlsxRows,
  type ResumenPlano,
} from "@/lib/resumenPivot";
import { etiquetaCategoria, esCategoriaNoRegistrado, normalizarCategoria } from "@/lib/resumenCategorias";
import { useInstance, fetchWithInstance } from "./InstanceContext";

const RESUMEN_STORAGE_KEY = "gestion-dash-resumen";

type ResumenPersisted = {
  fechaDesde: string;
  fechaHasta: string;
  empresa: string;
  estados: number[];
  subcategorias?: boolean;
  resumen?: ResumenItem[];
  instanceId?: string;
};

function loadResumenPersisted(currentInstance: string): ResumenPersisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RESUMEN_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ResumenPersisted>;
    if (p.instanceId && p.instanceId !== currentInstance) return null;
    return {
      fechaDesde: p.fechaDesde ?? "",
      fechaHasta: p.fechaHasta ?? "",
      empresa: p.empresa ?? "",
      estados: Array.isArray(p.estados) ? p.estados : [0, 1, 2, 3, 4],
      subcategorias: p.subcategorias !== false,
      resumen: Array.isArray(p.resumen) ? p.resumen : undefined,
    };
  } catch {
    return null;
  }
}

function saveResumenPersisted(p: ResumenPersisted, currentInstance: string) {
  try {
    sessionStorage.setItem(RESUMEN_STORAGE_KEY, JSON.stringify({ ...p, instanceId: currentInstance }));
  } catch { }
}


type ResumenItem = ResumenPlano;

type VistaReporte = "lista" | "pivot";

type Empresa = { codEmpresa: string; descripcion: string };

const ESTADOS: { valor: number; etiqueta: string }[] = [
  { valor: 0, etiqueta: "No enviado" },
  { valor: 1, etiqueta: "Enviada" },
  { valor: 2, etiqueta: "No registrado" },
  { valor: 3, etiqueta: "Registrado" },
  { valor: 4, etiqueta: "Medio de pago listo" },
];

export default function ResumenEstados() {
  const { instance } = useInstance();
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [estados, setEstados] = useState<number[]>([0, 1, 2, 3, 4]);
  const [empresa, setEmpresa] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [resumen, setResumen] = useState<ResumenItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [vista, setVista] = useState<VistaReporte>("pivot");
  const [subcategorias, setSubcategorias] = useState(true);
  const [empresasColapsadas, setEmpresasColapsadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    const p = loadResumenPersisted(instance);
    if (p) {
      setFechaDesde(p.fechaDesde);
      setFechaHasta(p.fechaHasta ?? "");
      setEmpresa(p.empresa);
      setEstados(p.estados);
      setSubcategorias(p.subcategorias !== false);
      if (p.resumen) {
        setResumen(
          p.resumen.map((r) => ({
            ...r,
            categoria: normalizarCategoria(r),
          })),
        );
      }
    } else {
      // Si no hay persistencia para esta instancia, limpiamos el resumen
      setResumen(null);
    }
  }, [instance]);

  useEffect(() => {
    let cancelled = false;
    setLoadingEmpresas(true);
    fetchWithInstance("/api/empresas", {}, instance)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.empresas) setEmpresas(json.empresas);
      })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoadingEmpresas(false); });
    return () => { cancelled = true; };
  }, [instance]);

  function toggleEstado(valor: number) {
    setEstados((prev) =>
      prev.includes(valor) ? prev.filter((e) => e !== valor) : [...prev, valor].sort((a, b) => a - b)
    );
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    const f = fechaDesde.trim();
    if (!f) return;
    if (estados.length === 0) {
      setError("Marca al menos un estado.");
      return;
    }
    setLoading(true);
    setError(null);
    setResumen(null);
    try {
      const params = new URLSearchParams({
        fechaDesde: f,
        estados: estados.join(","),
      });
      const fHasta = fechaHasta.trim();
      if (fHasta) params.set("fechaHasta", fHasta);
      if (empresa) params.set("empresa", empresa);
      if (subcategorias) params.set("subcategorias", "1");

      const res = await fetchWithInstance(`/api/resumen-estados?${params.toString()}`, {}, instance);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al cargar");
        return;
      }
      const resumenData = (json.resumen ?? []).map((r: ResumenItem & { categoria?: string }) => ({
        ...r,
        categoria: normalizarCategoria(r),
      }));
      setResumen(resumenData);
      saveResumenPersisted({
        fechaDesde: f,
        fechaHasta: fHasta,
        empresa,
        estados,
        subcategorias,
        resumen: resumenData,
      }, instance);
    } catch (err) {
      setError(String(err));
      setResumen([]);
    } finally {
      setLoading(false);
    }
  }

  const totalGeneral = resumen?.reduce((s, r) => s + r.cantidad, 0) ?? 0;

  const pivot = useMemo(
    () => (resumen?.length ? buildResumenPivot(resumen) : null),
    [resumen],
  );

  function toggleEmpresaColapsada(codEmpresa: string) {
    setEmpresasColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(codEmpresa)) next.delete(codEmpresa);
      else next.add(codEmpresa);
      return next;
    });
  }

  const filasPivotVisibles = useMemo(() => {
    if (!pivot) return [];
    return pivot.filas.filter((f) => {
      if (f.esEncabezadoGrupo) return true;
      if (empresasColapsadas.has(f.codEmpresa)) return false;
      return true;
    });
  }, [pivot, empresasColapsadas]);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      {/* Control Panel (Glassmorphism) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-zinc-50 border border-zinc-200/60 rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

          <div className="flex items-center gap-3 mb-8 relative z-10">
            <div className="p-2.5 bg-white rounded-xl text-indigo-600 shadow-sm border border-zinc-200/50">
              <Filter className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-black text-zinc-900 uppercase tracking-[0.2em]">
              Parámetros de Auditoría
            </h4>
          </div>

          <form onSubmit={handleBuscar} className="space-y-8 relative z-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Fecha Desde */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-wider ml-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Rango: Desde
                </label>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm font-bold text-zinc-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none shadow-sm"
                />
              </div>

              {/* Fecha Hasta */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-wider ml-1">
                  <Calendar className="w-3.5 h-3.5 opacity-50" />
                  Rango: Hasta
                </label>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm font-bold text-zinc-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none shadow-sm"
                />
              </div>

              {/* Empresa */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-wider ml-1">
                  <Building2 className="w-3.5 h-3.5" />
                  Entidad de Negocio
                </label>
                <select
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  disabled={loadingEmpresas}
                  className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm font-bold text-zinc-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none appearance-none shadow-sm disabled:opacity-50"
                >
                  <option value="">Consolidado Global</option>
                  {empresas.map((e) => (
                    <option key={e.codEmpresa} value={e.codEmpresa}>{e.descripcion}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Estados con Checkboxes Premium */}
            <div className="space-y-4 pt-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={subcategorias}
                  onChange={(e) => setSubcategorias(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-zinc-600 leading-relaxed">
                  <span className="font-bold text-zinc-800">Detallar «No registrado»</span>
                  {" "}(inventario / diferencia / falta registro). Si lo desmarcas, se agrupa en una sola fila.
                </span>
              </label>
            </div>

            <div className="space-y-4 pt-2">
              <label className="text-[11px] font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-wider">
                <ListChecks className="w-3.5 h-3.5" />
                Filtro por Estados Dinámicos
              </label>
              <div className="flex flex-wrap gap-2.5">
                {ESTADOS.map(({ valor, etiqueta }) => {
                  const isChecked = estados.includes(valor);
                  return (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => toggleEstado(valor)}
                      className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all duration-300 border flex items-center gap-2 ${isChecked
                        ? "bg-zinc-900 border-zinc-900 text-white shadow-md shadow-zinc-200 active:scale-95"
                        : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300 active:scale-95"
                        }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${isChecked ? "bg-white animate-pulse" : "bg-zinc-300"}`} />
                      {etiqueta}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-indigo-50 animate-pulse" />
                <span className="text-[11px] font-medium text-zinc-400 italic">
                  Listo para procesar consulta masiva...
                </span>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-10 h-14 bg-zinc-900 text-white text-sm font-bold rounded-[1.25rem] hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3 shadow-xl shadow-zinc-200/50"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                Actualizar Vista
              </button>
            </div>
          </form>
        </div>

        {/* Action Card Premium */}
        <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white flex flex-col justify-between shadow-2xl shadow-indigo-200/50 border border-indigo-500 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000" />

          <div className="relative z-10">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-2">
              Exportación
            </h4>
            <p className="text-xl font-bold leading-tight">
              Reporte para Toma de Decisiones
            </p>
          </div>

          <div className="space-y-4 relative z-10">
            <button
              onClick={async () => {
                if (!resumen?.length) return;
                if (vista === "pivot" && pivot) {
                  const aoa = pivotToXlsxRows(pivot);
                  const [headers, ...rows] = aoa;
                  await downloadXlsxTable({
                    filename: `reporte-pivot-${fechaDesde || new Date().toISOString().split("T")[0]}`,
                    sheetName: "Cuenta de Documento",
                    headers: headers.map(String),
                    rows: rows.map((r) => r.map((c) => (c === "" ? "" : c))),
                  });
                  return;
                }
                const headers = ["Empresa", "Fecha", "Tipo", "Estado", "Categoría", "Cantidad"];
                const rows = resumen.map((r) => [
                  r.descripcion,
                  r.fecha,
                  r.tipo,
                  String(r.estado),
                  etiquetaCategoria(r.categoria),
                  String(r.cantidad),
                ]);
                await downloadXlsxTable({
                  filename: `reporte-ventas-${new Date().toISOString().split("T")[0]}`,
                  sheetName: "Resumen",
                  headers,
                  rows,
                });
              }}
              disabled={!resumen || resumen.length === 0}
              className="w-full h-14 bg-white/10 hover:bg-white/15 backdrop-blur-md rounded-2xl border border-white/10 text-xs font-bold transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Download className="w-4 h-4" />
              {vista === "pivot" ? "Excel tipo Pivot" : "Documento Excel"}
            </button>
            <p className="text-[10px] text-center opacity-40 px-2 leading-relaxed">
              Exporta por entidad y fecha, igual que la tabla dinámica de Excel.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {resumen && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="rounded-[2.5rem] border border-zinc-100 bg-white shadow-xl shadow-zinc-200/30 overflow-hidden"
            id="resumen-reporte"
          >
            <div className="px-8 py-6 border-b border-zinc-100 bg-zinc-50/50 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-zinc-900">Resultados de Auditoría</h5>
                  <p className="text-[11px] text-zinc-400 font-medium">Consolidado por Empresa, Fecha y Estado</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setVista("pivot")}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${vista === "pivot" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"}`}
                  >
                    Pivot por entidad
                  </button>
                  <button
                    type="button"
                    onClick={() => setVista("lista")}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${vista === "lista" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"}`}
                  >
                    Lista detalle
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => triggerPrint("#resumen-reporte")}
                  className="p-2.5 text-zinc-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-zinc-200 shadow-sm"
                  title="Imprimir Vista"
                >
                  <Printer className="w-4.5 h-4.5" />
                </button>
                <div className="h-6 w-px bg-zinc-200 mx-1 hidden sm:block" />
                <span className="text-xs font-black text-zinc-900 bg-white px-4 py-2 rounded-xl shadow-sm border border-zinc-200">
                  {totalGeneral} documentos
                </span>
              </div>
            </div>

            <div className="overflow-x-auto min-h-[400px]">
              {vista === "pivot" && pivot ? (
                <table className="w-full text-sm border-separate border-spacing-0 min-w-[720px]">
                  <thead>
                    <tr className="text-left bg-sky-50/80">
                      <th className="sticky left-0 z-10 px-4 sm:px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-wider border-b border-zinc-100 bg-sky-50/95 min-w-[220px] sm:min-w-[280px]">
                        Etiquetas de fila
                      </th>
                      {pivot.fechasLabel.map((f) => (
                        <th key={f} className="px-3 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-wider border-b border-zinc-100 text-center whitespace-nowrap">
                          {f}
                        </th>
                      ))}
                      <th className="px-4 py-4 text-[10px] font-black text-zinc-700 uppercase tracking-wider border-b border-zinc-100 text-right whitespace-nowrap bg-zinc-50">
                        Total general
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasPivotVisibles.length === 0 ? (
                      <tr>
                        <td colSpan={pivot.fechas.length + 2} className="px-8 py-32 text-center text-zinc-400">
                          Sin coincidencias para el periodo seleccionado.
                        </td>
                      </tr>
                    ) : (
                      filasPivotVisibles.map((f, i) => {
                        const colapsada = empresasColapsadas.has(f.codEmpresa);

                        return (
                          <tr
                            key={`${f.codEmpresa}-${f.estado ?? "t"}-${i}`}
                            className={
                              f.esEncabezadoGrupo
                                ? "bg-indigo-50/50 border-t-2 border-indigo-100"
                                : f.esSubtotalGrupo
                                  ? "bg-zinc-100/90 border-b-2 border-zinc-200 font-bold"
                                  : "hover:bg-zinc-50/60 border-b border-zinc-50"
                            }
                          >
                            <td
                              className={`sticky left-0 z-10 py-2.5 border-r border-zinc-100 ${
                                f.esEncabezadoGrupo
                                  ? "bg-indigo-50/95 px-4 sm:px-6 font-bold text-zinc-900"
                                  : f.esSubtotalGrupo
                                    ? "bg-zinc-100 px-4 sm:px-6 font-bold"
                                    : f.esDetalleEstado
                                      ? "bg-white pl-10 sm:pl-12 pr-4 sm:pr-6 text-zinc-600"
                                      : "bg-white px-4 sm:px-6"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                {f.esEncabezadoGrupo && (
                                  <button
                                    type="button"
                                    onClick={() => toggleEmpresaColapsada(f.codEmpresa)}
                                    className="mt-0.5 text-zinc-500 hover:text-zinc-800 shrink-0"
                                    title={colapsada ? "Expandir detalle" : "Colapsar detalle"}
                                  >
                                    <ChevronRight className={`w-4 h-4 transition-transform ${colapsada ? "" : "rotate-90"}`} />
                                  </button>
                                )}
                                {f.esDetalleEstado && (
                                  <span className="w-4 shrink-0 text-zinc-300 select-none" aria-hidden>
                                    └
                                  </span>
                                )}
                                <span
                                  className={`text-xs sm:text-sm leading-snug ${
                                    f.esEncabezadoGrupo
                                      ? "font-bold text-zinc-900"
                                      : f.esSubtotalGrupo
                                        ? "font-bold text-zinc-800"
                                        : "text-zinc-600"
                                  }`}
                                >
                                  {f.etiqueta}
                                </span>
                              </div>
                            </td>
                            {pivot.fechas.map((fecha) => {
                              const v = f.valores[fecha] ?? 0;
                              const ocultarNumerosEncabezado = f.esEncabezadoGrupo && !colapsada;
                              return (
                                <td
                                  key={fecha}
                                  className={`px-3 py-2.5 text-center tabular-nums text-sm ${
                                    ocultarNumerosEncabezado
                                      ? "text-zinc-300"
                                      : f.esSubtotalGrupo || f.esEncabezadoGrupo
                                        ? "font-bold text-zinc-900"
                                        : v
                                          ? "text-zinc-800"
                                          : "text-zinc-300"
                                  }`}
                                >
                                  {ocultarNumerosEncabezado ? "" : v || ""}
                                </td>
                              );
                            })}
                            <td
                              className={`px-4 py-2.5 text-right tabular-nums text-sm bg-zinc-50/50 ${
                                f.esSubtotalGrupo || (f.esEncabezadoGrupo && colapsada)
                                  ? "font-black text-zinc-900"
                                  : f.esEncabezadoGrupo
                                    ? "text-zinc-300"
                                    : "font-semibold text-zinc-800"
                              }`}
                            >
                              {f.esEncabezadoGrupo && !colapsada ? "" : f.total || ""}
                            </td>
                          </tr>
                        );
                      })
                    )}
                    {pivot.fechas.length > 0 && (
                      <tr className="bg-zinc-900 text-white font-black">
                        <td className="sticky left-0 z-10 px-4 sm:px-6 py-3 bg-zinc-900 border-r border-zinc-700">
                          Total general
                        </td>
                        {pivot.fechas.map((fecha) => (
                          <td key={fecha} className="px-3 py-3 text-center tabular-nums">
                            {pivot.totalesPorFecha[fecha] ?? 0}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right tabular-nums bg-zinc-800">
                          {pivot.totalGeneral}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left">
                      <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 bg-zinc-50/30">Empresa / Origen</th>
                      <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 bg-zinc-50/30">Fecha</th>
                      <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 bg-zinc-50/30">Tipo</th>
                      <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 bg-zinc-50/30">Estado Integración</th>
                      <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 bg-zinc-50/30 text-right">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {resumen.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-32 text-center">
                          <div className="flex flex-col items-center gap-4 text-zinc-300">
                            <Search className="w-12 h-12 opacity-20" />
                            <p className="text-sm font-bold opacity-50">Sin coincidencias para el periodo seleccionado.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      resumen.map((r, i) => {
                        const etiqueta = etiquetaCategoria(r.categoria);
                        const isRegistrado = r.categoria === "3";
                        const isNoRegistrado = esCategoriaNoRegistrado(r.categoria);
                        const isPendiente = r.categoria === "0" || r.categoria === "1";

                        return (
                          <tr
                            key={`${r.codEmpresa}-${r.fecha}-${r.tipo}-${r.categoria}-${i}`}
                            className="hover:bg-zinc-50/80 transition-all duration-300 group"
                          >
                            <td className="px-8 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-[10px] font-black text-zinc-500 group-hover:bg-white group-hover:shadow-sm border border-transparent group-hover:border-zinc-100 transition-all">
                                  {r.descripcion.substring(0, 2).toUpperCase()}
                                </div>
                                <span className="text-sm font-bold text-zinc-900">{r.descripcion}</span>
                              </div>
                            </td>
                            <td className="px-8 py-4">
                              <span className="text-xs font-semibold text-zinc-500">{r.fecha}</span>
                            </td>
                            <td className="px-8 py-4">
                              <span className="inline-flex px-2.5 py-1 rounded-md bg-zinc-900 text-white text-[10px] font-black uppercase tracking-tight">
                                {r.tipo}
                              </span>
                            </td>
                            <td className="px-8 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight border ${isRegistrado
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100/50"
                                : isNoRegistrado
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-100/50"
                                : isPendiente
                                  ? "bg-amber-50 text-amber-700 border-amber-100/50"
                                  : "bg-zinc-50 text-zinc-600 border-zinc-100"
                                }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${isRegistrado ? "bg-emerald-500" : isNoRegistrado ? "bg-indigo-500" : isPendiente ? "bg-amber-500" : "bg-zinc-400"
                                  }`} />
                                {etiqueta}
                              </span>
                            </td>
                            <td className="px-8 py-4 text-right">
                              <span className="text-lg font-mono font-black text-zinc-900 tabular-nums">
                                {r.cantidad}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-8 py-5 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Reporte Validado
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-zinc-500">Última actualización: {new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
