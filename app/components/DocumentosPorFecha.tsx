"use client";

import { useState, useEffect } from "react";
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

const estadoSii = (e: number | null) =>
  e === 2 ? "Timbrado" : e === 1 ? "Sin timbrar" : "—";
const estadoDyn = (e: number | null) => {
  // Tratamos null igual que 0: "Sin enviar"
  if (e == null || e === 0) return "Sin enviar";
  const t: Record<number, string> = {
    1: "Enviada",
    2: "Loc. OK",
    3: "Registrado",
    4: "Medio pago",
  };
  return t[e] ?? e;
};

const chipEstadoClass = (e: number | null) => {
  if (e == null || e === 0) return "bg-slate-200 text-slate-900";
  if (e === 1) return "bg-amber-500 text-white";
  if (e === 2 || e === 3) return "bg-emerald-600 text-white";
  if (e === 4) return "bg-indigo-600 text-white";
  return "bg-slate-300 text-slate-900";
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
  } catch {}
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
      .catch(() => {})
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
  const listaVisible = (list ?? []).filter((d) => {
    if (filtroTrim && !String(d.numero).toLowerCase().includes(filtroTrim) && !d.tipo.toLowerCase().includes(filtroTrim))
      return false;
    if (filtroColTipo && d.tipo !== filtroColTipo) return false;
    if (filtroColSII !== "" && (d.estadoSII ?? -1) !== Number(filtroColSII)) return false;
    if (filtroColDynamics !== "") {
      const target = Number(filtroColDynamics);
      const val = d.estadoEnvio;
      // Para "Sin enviar" (0) incluimos tanto 0 como null
      if (target === 0) {
        if (!(val == null || val === 0)) return false;
      } else if (val !== target) {
        return false;
      }
    }
    return true;
  });
  const hayFiltrosColumna = filtroColTipo || filtroColSII !== "" || filtroColDynamics !== "" || filtroTrim;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      <form
        onSubmit={handleBuscar}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label htmlFor="fecha-docs" className="block text-sm font-medium text-slate-700 mb-1">
              Fecha
            </label>
            <input
              id="fecha-docs"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              max={hoy}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
              aria-label="Fecha"
            />
          </div>
          <div>
            <label htmlFor="numero-docs" className="block text-sm font-medium text-slate-700 mb-1">
              Número (opcional)
            </label>
            <input
              id="numero-docs"
              type="text"
              value={numeroFilter}
              onChange={(e) => setNumeroFilter(e.target.value)}
              placeholder="Ej: 6512585"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
              aria-label="Filtrar por número de documento"
            />
          </div>
          <div>
            <label htmlFor="empresa-docs" className="block text-sm font-medium text-slate-700 mb-1">
              Empresa
            </label>
            <select
              id="empresa-docs"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              disabled={loadingEmpresas}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60"
              aria-label="Filtrar por empresa"
            >
              <option value="">Todas</option>
              {empresas.map((e) => (
                <option key={e.codEmpresa} value={e.codEmpresa}>
                  {e.descripcion}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tipo-docs" className="block text-sm font-medium text-slate-700 mb-1">
              Tipo documento
            </label>
            <select
              id="tipo-docs"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
              aria-label="Filtrar por tipo"
            >
              <option value="">Todos</option>
              <option value="BLE">BLE</option>
              <option value="FCV">FCV</option>
              <option value="NCV">NCV</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Cargando…" : "Buscar"}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {list && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" id="documentos-fecha-reporte">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border-b border-slate-200 bg-slate-900">
            <p className="text-sm text-slate-100">
              <strong>{total}</strong> documento(s). Usa los filtros para acotar y
              &quot;Ver detalle&quot; para revisar un documento puntual.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const headers = ["Tipo", "Número", "Fecha emisión", "SII", "Dynamics", "Líneas Gestion"];
                  const rows = listaVisible.map((d) => [
                    d.tipo,
                    String(d.numero),
                    d.fechaEmision?.slice(0, 16) ?? "",
                    estadoSii(d.estadoSII),
                    estadoDyn(d.estadoEnvio),
                    String(d.lineasGestion ?? 0),
                  ]);
                  const csv = rowsToCsv(headers, rows);
                  downloadCsv(`documentos-fecha-${fecha || "lista"}.csv`, csv);
                }}
                className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
              >
                Exportar CSV
              </button>
              <button
                type="button"
                onClick={async () => {
                  const headers = ["Tipo", "Número", "Fecha emisión", "SII", "Dynamics", "Líneas Gestion"];
                  const rows = listaVisible.map((d) => [
                    d.tipo,
                    d.numero,
                    d.fechaEmision?.slice(0, 16) ?? "",
                    estadoSii(d.estadoSII),
                    estadoDyn(d.estadoEnvio),
                    d.lineasGestion ?? 0,
                  ]);
                  await downloadXlsxTable({
                    filename: `documentos-fecha-${fecha || "lista"}`,
                    sheetName: "Documentos",
                    headers,
                    rows,
                  });
                }}
                className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
              >
                Exportar Excel
              </button>
              <button
                type="button"
                onClick={() => triggerPrint("#documentos-fecha-reporte")}
                className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
              >
                Imprimir
              </button>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                Mostrar
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPage(1);
                    loadDocumentos(1, v);
                  }}
                  className="rounded border border-slate-400 bg-white px-2 py-1 text-slate-900"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                por página
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <label className="text-sm font-medium text-slate-700">
              Buscar en esta página:
            </label>
            <input
              type="text"
              value={filtroTabla}
              onChange={(e) => setFiltroTabla(e.target.value)}
              placeholder="Número o tipo (ej: 505181, BLE)"
              className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
              aria-label="Filtrar tabla por número o tipo"
            />
            {(filtroTrim || hayFiltrosColumna) && (
              <span className="text-sm text-slate-600">
                Mostrando {listaVisible.length} de {list.length}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-left">
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Tipo
                  </th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Número
                  </th>
                  <th className="hidden p-3 text-xs font-semibold uppercase tracking-wide text-slate-700 sm:table-cell">
                    Fecha
                  </th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    SII
                  </th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Dynamics
                  </th>
                  <th className="p-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Líneas (Gestion)
                  </th>
                  <th className="w-28 p-3 text-xs font-semibold uppercase tracking-wide text-slate-700" />
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left">
                  <th className="p-2">
                    <select
                      value={filtroColTipo}
                      onChange={(e) => setFiltroColTipo(e.target.value)}
                      className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
                      aria-label="Filtrar por tipo"
                    >
                      <option value="">Todos</option>
                      <option value="BLE">BLE</option>
                      <option value="FCV">FCV</option>
                      <option value="NCV">NCV</option>
                    </select>
                  </th>
                  <th className="p-2 text-xs text-slate-500">—</th>
                  <th className="hidden p-2 sm:table-cell" />
                  <th className="p-2">
                    <select
                      value={filtroColSII}
                      onChange={(e) => setFiltroColSII(e.target.value)}
                      className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
                      aria-label="Filtrar por SII"
                    >
                      <option value="">Todos</option>
                      <option value="2">Timbrado</option>
                      <option value="1">Sin timbrar</option>
                    </select>
                  </th>
                  <th className="p-2">
                    <select
                      value={filtroColDynamics}
                      onChange={(e) => setFiltroColDynamics(e.target.value)}
                      className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
                      aria-label="Filtrar por Dynamics"
                    >
                      <option value="">Todos</option>
                      <option value="0">Sin enviar</option>
                      <option value="1">Enviada</option>
                      <option value="2">Loc. OK</option>
                      <option value="3">Registrado</option>
                      <option value="4">Medio pago</option>
                    </select>
                  </th>
                  <th className="p-2 text-right text-xs text-slate-500">—</th>
                  <th className="w-28 p-2" />
                </tr>
              </thead>
              <tbody>
                {listaVisible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      {list.length === 0
                        ? "No hay documentos para los filtros seleccionados."
                        : "Ningún documento coincide con los filtros de columna o buscador."}
                    </td>
                  </tr>
                ) : (
                  listaVisible.map((d) => (
                    <tr
                      key={d.idDocumento ?? `${d.tipo}-${d.numero}`}
                      className="border-b border-slate-100 even:bg-slate-50 hover:bg-slate-100/70"
                    >
                      <td className="p-3">
                        <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                          {d.tipo}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-sm font-semibold text-slate-900">
                        {d.numero}
                      </td>
                      <td className="hidden p-3 text-sm text-slate-700 sm:table-cell">
                        {d.fechaEmision?.slice(0, 16) ?? "—"}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-900">
                          {estadoSii(d.estadoSII)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${chipEstadoClass(
                            d.estadoEnvio,
                          )}`}
                        >
                          {estadoDyn(d.estadoEnvio)}
                        </span>
                      </td>
                      <td className="p-3 text-right text-base font-bold text-slate-900">
                        {d.lineasGestion ?? 0}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => onVerDetalle(d.numero)}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-800 shadow-sm hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-sm text-slate-600">
                {hayFiltrosColumna
                  ? `Página: ${desde}–${hasta} de ${total} (visibles: ${listaVisible.length})`
                  : `Mostrando ${desde}–${hasta} de ${total}`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1 || loading}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Anterior
                </button>
                <span className="text-sm text-slate-600 px-2">
                  Página {page} de {totalPaginas}
                </span>
                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPaginas || loading}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
