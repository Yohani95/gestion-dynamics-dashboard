"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Calendar, Building2, FileText, Download,
  ChevronLeft, ChevronRight, Filter, List, ArrowUpRight,
  Printer, FileJson, FileSpreadsheet, AlertCircle, CheckCircle2,
  Clock, Info, MoreHorizontal, RefreshCw
} from "lucide-react";
import { rowsToCsv, downloadCsv, downloadXlsxTable, triggerPrint } from "@/lib/exportUtils";

type DocItem = {
  tipo: string;
  numero: number;
  idDocumento: string;
  codEmpresa?: string;
  fechaEmision: string;
  estadoSII: number | null;
  estadoEnvio: number | null;
  lineasGestion: number;
};

type Empresa = { codEmpresa: string; descripcion: string };

type Props = {
  onVerDetalle: (numero: number) => void;
};

const getSiiLabel = (e: number | null) =>
  e === 2 ? "Timbrado" : e === 1 ? "Sin timbrar" : "—";

const getDynLabel = (e: number | null) => {
  if (e == null || e === 0) return "Sin enviar";
  const t: Record<number, string> = {
    1: "Enviada",
    2: "Loc. OK",
    3: "Registrado",
    4: "Medio pago",
  };
  return t[e] ?? e;
};

const PAGE_SIZES = [25, 50, 100, 200];
const STORAGE_KEY = "gestion-dash-lista";

function loadPersisted() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { fecha: string; empresa: string; tipo: string; numero: string; page: number; pageSize: number };
  } catch {
    return null;
  }
}

function savePersisted(p: { fecha: string; empresa: string; tipo: string; numero: string; page: number; pageSize: number }) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch { }
}

export default function DocumentosPorFecha({ onVerDetalle }: Props) {
  const [fecha, setFecha] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [tipo, setTipo] = useState("");
  const [numeroFilter, setNumeroFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [list, setList] = useState<DocItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [filtroTabla, setFiltroTabla] = useState("");
  const [filtroColTipo, setFiltroColTipo] = useState("");
  const [filtroColSII, setFiltroColSII] = useState("");
  const [filtroColDynamics, setFiltroColDynamics] = useState("");

  useEffect(() => {
    const p = loadPersisted();
    if (p) {
      setFecha(p.fecha);
      setEmpresa(p.empresa);
      setTipo(p.tipo);
      setNumeroFilter(p.numero);
      setPage(p.page);
      setPageSize(p.pageSize);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingEmpresas(true);
    fetch("/api/empresas")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.empresas) setEmpresas(json.empresas);
      })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoadingEmpresas(false); });
    return () => { cancelled = true; };
  }, []);

  async function loadDocumentos(pageNum: number = page, overridePageSize?: number) {
    const f = fecha.trim();
    if (!f) return;
    const size = overridePageSize ?? pageSize;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        fecha: f,
        page: String(pageNum),
        pageSize: String(size),
      });
      if (empresa) params.set("empresa", empresa);
      if (tipo) params.set("tipo", tipo);
      if (numeroFilter.trim()) params.set("numero", numeroFilter.trim());
      const res = await fetch(`/api/documentos?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al cargar");
        setList([]);
        setTotal(0);
        setTotalPaginas(0);
        return;
      }
      setList(json.documentos ?? []);
      setTotal(json.total ?? 0);
      setTotalPaginas(json.totalPaginas ?? 1);
      setPage(pageNum);
      if (overridePageSize != null) setPageSize(overridePageSize);
      savePersisted({ fecha: f, empresa, tipo, numero: numeroFilter, page: pageNum, pageSize: size });
    } catch (err) {
      setError(String(err));
      setList([]);
      setTotal(0);
      setTotalPaginas(0);
    } finally {
      setLoading(false);
    }
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    await loadDocumentos(1);
  }

  function handlePageChange(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPaginas || loading) return;
    loadDocumentos(nextPage);
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);

  const filtroTrim = filtroTabla.trim().toLowerCase();
  const listaVisible = useMemo(() => {
    return (list ?? []).filter((d) => {
      if (filtroTrim && !String(d.numero).toLowerCase().includes(filtroTrim) && !d.tipo.toLowerCase().includes(filtroTrim))
        return false;
      if (filtroColTipo && d.tipo !== filtroColTipo) return false;
      if (filtroColSII !== "" && (d.estadoSII ?? -1) !== Number(filtroColSII)) return false;
      if (filtroColDynamics !== "") {
        const target = Number(filtroColDynamics);
        const val = d.estadoEnvio;
        if (target === 0) {
          if (!(val == null || val === 0)) return false;
        } else if (val !== target) {
          return false;
        }
      }
      return true;
    });
  }, [list, filtroTrim, filtroColTipo, filtroColSII, filtroColDynamics]);

  const hayFiltrosColumna = filtroColTipo || filtroColSII !== "" || filtroColDynamics !== "" || filtroTrim;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 md:space-y-8 pb-10 px-4 md:px-0">
      {/* Control Panel (Glassmorphism) */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-50 border border-zinc-200/60 rounded-3xl md:rounded-[2.5rem] p-6 md:p-8 shadow-sm relative overflow-hidden group"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

        <div className="flex items-center justify-between mb-6 md:mb-8 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 md:p-2.5 bg-white rounded-xl text-indigo-600 shadow-sm border border-zinc-200/50">
              <Filter className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <div>
              <h4 className="text-xs md:text-sm font-black text-zinc-900 uppercase tracking-[0.2em]">
                Auditoría de Documentos
              </h4>
              <p className="text-[9px] md:text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Búsqueda avanzada de transacciones</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleBuscar} className="space-y-5 md:space-y-6 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[10px] md:text-[11px] font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-wider ml-1">
                <Calendar className="w-3 h-3 md:w-3.5 md:h-3.5" />
                Fecha Emisión
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                max={hoy}
                className="w-full bg-white border border-zinc-200 rounded-xl md:rounded-2xl px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm font-bold text-zinc-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none shadow-sm"
              />
            </div>

            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[10px] md:text-[11px] font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-wider ml-1">
                <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
                N° Documento
              </label>
              <input
                type="text"
                value={numeroFilter}
                onChange={(e) => setNumeroFilter(e.target.value)}
                placeholder="Ej: 6512585"
                className="w-full bg-white border border-zinc-200 rounded-xl md:rounded-2xl px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm font-bold text-zinc-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none shadow-sm placeholder:text-zinc-300 placeholder:font-normal"
              />
            </div>

            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[10px] md:text-[11px] font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-wider ml-1">
                <Building2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                Empresa Origen
              </label>
              <select
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                disabled={loadingEmpresas}
                className="w-full bg-white border border-zinc-200 rounded-xl md:rounded-2xl px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm font-bold text-zinc-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none appearance-none shadow-sm disabled:opacity-50"
              >
                <option value="">Todas las Entidades</option>
                {empresas.map((e) => (
                  <option key={e.codEmpresa} value={e.codEmpresa}>{e.descripcion}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[10px] md:text-[11px] font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-wider ml-1">
                <List className="w-3 h-3 md:w-3.5 md:h-3.5" />
                Tipo Doc.
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full bg-white border border-zinc-200 rounded-xl md:rounded-2xl px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm font-bold text-zinc-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none appearance-none shadow-sm"
              >
                <option value="">Todos los Tipos</option>
                <option value="BLE">Boleta (BLE)</option>
                <option value="FCV">Factura (FCV)</option>
                <option value="NCV">Nota Crédito (NCV)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 md:pt-6 border-t border-zinc-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="hidden md:flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Motor de búsqueda activo</span>
            </div>

            <button
              type="submit"
              disabled={loading || !fecha}
              className="w-full md:w-auto px-10 h-12 md:h-14 bg-zinc-900 text-white text-xs md:text-sm font-bold rounded-xl md:rounded-[1.25rem] hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-3 shadow-xl shadow-zinc-200/50"
            >
              {loading ? <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Search className="w-4 h-4 md:w-5 md:h-5" />}
              Consultar Documentos
            </button>
          </div>
        </form>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 flex items-center gap-3 text-rose-800"
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-xs md:text-sm font-bold">{error}</p>
        </motion.div>
      )}

      {list && (
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl md:rounded-[2.5rem] border border-zinc-100 bg-white shadow-xl shadow-zinc-200/30 overflow-hidden"
            id="documentos-fecha-reporte"
          >
            {/* Table Header / Toolbar */}
            <div className="px-5 py-5 md:px-8 md:py-6 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4 md:gap-6">
              <div className="flex items-center gap-3 md:gap-4 self-start">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner">
                  <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <div>
                  <h5 className="text-xs md:text-sm font-bold text-zinc-900 leading-none">Resultados de Consulta</h5>
                  <p className="text-[9px] md:text-[11px] text-zinc-400 font-medium mt-1">Consolidado: {total} documentos encontrados</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full sm:w-auto">
                {/* Internal Search */}
                <div className="relative group flex-1 sm:flex-initial">
                  <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-300 group-focus-within:text-indigo-500 transition-colors" />
                  <input
                    type="text"
                    value={filtroTabla}
                    onChange={(e) => setFiltroTabla(e.target.value)}
                    placeholder="Filtrar en vista..."
                    className="bg-white border border-zinc-200 rounded-xl pl-9 md:pl-10 pr-4 py-2 md:py-2.5 text-[10px] md:text-xs font-bold text-zinc-800 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none w-full sm:w-40 md:w-48 transition-all"
                  />
                </div>

                <div className="h-6 md:h-8 w-px bg-zinc-200 mx-1 hidden sm:block" />

                <div className="flex items-center gap-1.5 md:gap-2">
                  <button
                    onClick={async () => {
                      const headers = ["Tipo", "Número", "Emisión", "SII", "Dynamics", "Líneas"];
                      const rows = listaVisible.map(d => [d.tipo, d.numero, d.fechaEmision, getSiiLabel(d.estadoSII), getDynLabel(d.estadoEnvio), d.lineasGestion]);
                      await downloadXlsxTable({ filename: `reporte-docs-${fecha}`, sheetName: "Docs", headers, rows });
                    }}
                    className="p-2 md:p-2.5 text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg md:rounded-xl border border-zinc-200 transition-all bg-white shadow-sm"
                    title="Exportar Excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 md:w-4.5 md:h-4.5" />
                  </button>
                  <button
                    onClick={() => triggerPrint("#documentos-fecha-reporte")}
                    className="p-2 md:p-2.5 text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg md:rounded-xl border border-zinc-200 transition-all bg-white shadow-sm"
                    title="Imprimir"
                  >
                    <Printer className="w-3.5 h-3.5 md:w-4.5 md:h-4.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile View: Cards */}
            <div className="block lg:hidden divide-y divide-zinc-100">
              {listaVisible.length === 0 ? (
                <div className="px-8 py-20 text-center flex flex-col items-center gap-4 text-zinc-300">
                  <Search className="w-10 h-10 opacity-20" />
                  <p className="text-xs font-bold opacity-50">No hay documentos para esta vista.</p>
                </div>
              ) : (
                listaVisible.map((d, i) => {
                  const siiStatus = d.estadoSII === 2;
                  const dynStatus = d.estadoEnvio === 3;
                  const dynWarn = d.estadoEnvio === 1 || d.estadoEnvio === 2;

                  return (
                    <motion.div
                      key={d.idDocumento ?? `${d.tipo}-${d.numero}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.01 }}
                      className="p-5 space-y-4 active:bg-zinc-50 transition-colors"
                      onClick={() => onVerDetalle(d.numero)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded-md bg-zinc-900 text-white text-[9px] font-black tracking-tight">
                            {d.tipo}
                          </span>
                          <span className="text-sm font-black text-zinc-900 tabular-nums">#{d.numero}</span>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-zinc-300" />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">SII</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight border ${siiStatus ? "bg-emerald-50 text-emerald-700 border-emerald-100/50" : "bg-rose-50 text-rose-700 border-rose-100/50"
                            }`}>
                            {getSiiLabel(d.estadoSII)}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Dynamics</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight border ${dynStatus
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100/50"
                              : dynWarn
                                ? "bg-amber-50 text-amber-700 border-amber-100/50"
                                : "bg-zinc-50 text-zinc-600 border-zinc-100"
                            }`}>
                            {getDynLabel(d.estadoEnvio)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-1 text-zinc-400">
                          <Clock className="w-3 h-3 opacity-50" />
                          <span className="text-[10px] font-semibold">{d.fechaEmision.slice(11, 16)}</span>
                        </div>
                        <div className="text-[10px] font-bold text-zinc-600">
                          {d.lineasGestion} <span className="opacity-50">LÍNEAS</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Desktop View: Main Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-left bg-zinc-50/30">
                    <th className="px-8 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100">
                      <div className="flex items-center gap-2">
                        TIPO
                        <select
                          value={filtroColTipo}
                          onChange={e => setFiltroColTipo(e.target.value)}
                          className="bg-transparent border-none text-[10px] p-0 font-black text-indigo-500 focus:ring-0 appearance-none cursor-pointer"
                        >
                          <option value="">(TODOS)</option>
                          <option value="BLE">BLE</option>
                          <option value="FCV">FCV</option>
                          <option value="NCV">NCV</option>
                        </select>
                      </div>
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100">DOCUMENTO</th>
                    <th className="px-8 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 hidden lg:table-cell">EMISIÓN</th>
                    <th className="px-8 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100">
                      <div className="flex items-center gap-2">
                        SII
                        <select
                          value={filtroColSII}
                          onChange={e => setFiltroColSII(e.target.value)}
                          className="bg-transparent border-none text-[10px] p-0 font-black text-indigo-500 focus:ring-0 appearance-none cursor-pointer"
                        >
                          <option value="">(TODOS)</option>
                          <option value="2">Timbrado</option>
                          <option value="1">Sin timbrar</option>
                        </select>
                      </div>
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100">
                      <div className="flex items-center gap-2">
                        DYNAMICS
                        <select
                          value={filtroColDynamics}
                          onChange={e => setFiltroColDynamics(e.target.value)}
                          className="bg-transparent border-none text-[10px] p-0 font-black text-indigo-500 focus:ring-0 appearance-none cursor-pointer"
                        >
                          <option value="">(TODOS)</option>
                          <option value="0">Pendiente</option>
                          <option value="1">Enviado</option>
                          <option value="2">Local OK</option>
                          <option value="3">Registrado</option>
                          <option value="4">Pág. Listo</option>
                        </select>
                      </div>
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 text-right">LÍNEAS</th>
                    <th className="px-8 py-4 border-b border-zinc-100" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {listaVisible.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-8 py-32 text-center">
                        <div className="flex flex-col items-center gap-4 text-zinc-300">
                          <Search className="w-12 h-12 opacity-20" />
                          <p className="text-sm font-bold opacity-50">No hay documentos para esta vista.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    listaVisible.map((d, i) => {
                      const siiStatus = d.estadoSII === 2;
                      const dynStatus = d.estadoEnvio === 3;
                      const dynWarn = d.estadoEnvio === 1 || d.estadoEnvio === 2;

                      return (
                        <motion.tr
                          key={d.idDocumento ?? `${d.tipo}-${d.numero}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.01 }}
                          className="hover:bg-zinc-50/80 transition-all duration-300 group"
                        >
                          <td className="px-8 py-4">
                            <span className="inline-flex px-2 py-1 rounded-md bg-zinc-900 text-white text-[10px] font-black tracking-tight group-hover:scale-105 transition-transform">
                              {d.tipo}
                            </span>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-zinc-900 tabular-nums">#{d.numero}</span>
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{d.idDocumento.substring(0, 8)}...</span>
                            </div>
                          </td>
                          <td className="px-8 py-4 hidden lg:table-cell">
                            <div className="flex items-center gap-2 text-zinc-500">
                              <Clock className="w-3.5 h-3.5 opacity-50" />
                              <span className="text-xs font-semibold">{d.fechaEmision.slice(0, 16)}</span>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight border ${siiStatus ? "bg-emerald-50 text-emerald-700 border-emerald-100/50" : "bg-rose-50 text-rose-700 border-rose-100/50"
                              }`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${siiStatus ? "bg-emerald-500" : "bg-rose-500"}`} />
                              {getSiiLabel(d.estadoSII)}
                            </span>
                          </td>
                          <td className="px-8 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight border ${dynStatus
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100/50"
                                : dynWarn
                                  ? "bg-amber-50 text-amber-700 border-amber-100/50"
                                  : "bg-zinc-50 text-zinc-600 border-zinc-100"
                              }`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${dynStatus ? "bg-emerald-500" : dynWarn ? "bg-amber-500" : "bg-zinc-400"}`} />
                              {getDynLabel(d.estadoEnvio)}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <span className="text-sm font-black text-zinc-900">{d.lineasGestion}</span>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <button
                              onClick={() => onVerDetalle(d.numero)}
                              className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all active:scale-90 border border-transparent hover:border-zinc-200 hover:shadow-sm"
                            >
                              <ArrowUpRight className="w-5 h-5" />
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination / Footer */}
            <div className="px-5 py-5 md:px-8 md:py-5 bg-zinc-900 border-t border-zinc-800 flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4 md:gap-6">
              <div className="flex items-center gap-4 md:gap-6 self-start sm:self-center">
                <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  <Info className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  <span className="hidden xs:inline">Mostrando</span> {desde}-{hasta} de {total}
                </div>

                <div className="h-4 w-px bg-zinc-800 hidden xs:block" />

                <div className="flex items-center gap-2 md:gap-3">
                  <span className="text-[9px] md:text-[10px] font-bold text-zinc-600 uppercase">Filas</span>
                  <select
                    value={pageSize}
                    onChange={e => loadDocumentos(1, Number(e.target.value))}
                    className="bg-zinc-800 border-zinc-700 rounded-lg text-[9px] md:text-[10px] font-black text-white px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer pr-5 md:pr-6 relative"
                    style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'white\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '10px md:12px' }}
                  >
                    {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {totalPaginas > 1 && (
                <div className="flex items-center gap-2 md:gap-4 w-full sm:w-auto justify-center">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1 || loading}
                    className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-zinc-800 text-white flex items-center justify-center hover:bg-zinc-700 transition-all border border-zinc-700 disabled:opacity-20 disabled:pointer-events-none active:scale-95 shadow-lg"
                  >
                    <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                  </button>

                  <div className="px-3 md:px-4 h-8 md:h-10 bg-zinc-800 rounded-xl border border-zinc-700 flex items-center gap-1.5 md:gap-2">
                    <span className="text-[10px] md:text-[11px] font-black text-white tabular-nums">{page}</span>
                    <span className="text-[9px] md:text-[10px] font-bold text-zinc-600 uppercase italic">de</span>
                    <span className="text-[10px] md:text-[11px] font-black text-zinc-500 tabular-nums">{totalPaginas}</span>
                  </div>

                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPaginas || loading}
                    className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-zinc-800 text-white flex items-center justify-center hover:bg-zinc-700 transition-all border border-zinc-700 disabled:opacity-20 disabled:pointer-events-none active:scale-95 shadow-lg"
                  >
                    <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
