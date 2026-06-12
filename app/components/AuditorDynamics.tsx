"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Play,
  Download,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Filter,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { useInstance, fetchWithInstance } from "./InstanceContext";
import { downloadXlsxTable } from "@/lib/exportUtils";
import {
  AUDITOR_DYNAMICS_LOTE,
  type HallazgoCodigo,
  type ResultadoAuditorDocumento,
} from "@/lib/auditorDynamics.types";

type Empresa = { codEmpresa: string; descripcion: string };

export type AuditorDynamicsEstado = {
  procesando: boolean;
  fecha: string | null;
  loteActual: number;
  totalLotes: number;
  docsProcesados: number;
  totalDocs: number;
  resultado: { ok: boolean; text: string } | null;
};

type Props = {
  onEstadoChange?: (estado: AuditorDynamicsEstado) => void;
};

const PAGE_SIZES = [25, 50, 100, 200] as const;

const hoy = () => new Date().toISOString().slice(0, 10);

const estadoBadge = (estado: ResultadoAuditorDocumento["estadoAuditoria"]) => {
  if (estado === "ok") return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200";
  if (estado === "warning") return "bg-amber-100 text-amber-900 ring-1 ring-amber-200";
  if (estado === "error") return "bg-rose-100 text-rose-900 ring-1 ring-rose-200";
  return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200";
};

const estadoLabel = (estado: ResultadoAuditorDocumento["estadoAuditoria"]) => {
  if (estado === "ok") return "OK";
  if (estado === "warning") return "Observación";
  if (estado === "error") return "Diferencia";
  return "Omitido";
};

const HALLAZGO_OPCIONES: { value: HallazgoCodigo | ""; label: string }[] = [
  { value: "", label: "Cualquier hallazgo" },
  { value: "no_en_bc", label: "No existe en BC" },
  { value: "monto_diferente", label: "Monto distinto" },
  { value: "menos_lineas", label: "Menos líneas en BC" },
  { value: "mas_lineas", label: "Más líneas en BC" },
  { value: "lineas_duplicadas_bc", label: "Líneas duplicadas BC" },
  { value: "error_bc", label: "Error consulta BC" },
  { value: "sin_timbrar", label: "Sin timbrar SII" },
];

function formatMonto(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}

function etiquetaRango(desde: string, hasta: string) {
  return desde === hasta ? desde : `${desde} → ${hasta}`;
}

function filtrarResultados(
  resultados: ResultadoAuditorDocumento[],
  opts: {
    buscar: string;
    estadoAuditor: string;
    hallazgo: string;
    empresa: string;
    tipo: string;
  },
): ResultadoAuditorDocumento[] {
  const q = opts.buscar.trim().toLowerCase();

  return resultados.filter((r) => {
    if (opts.empresa && r.codEmpresa !== opts.empresa) return false;
    if (opts.tipo && r.tipo !== opts.tipo) return false;

    if (q) {
      const doc = `${r.tipo}-${r.numero}`.toLowerCase();
      const match =
        doc.includes(q) ||
        String(r.numero).includes(q) ||
        r.numeroBc.toLowerCase().includes(q) ||
        r.empresaNombre.toLowerCase().includes(q);
      if (!match) return false;
    }

    if (opts.estadoAuditor === "problemas") {
      if (r.estadoAuditoria === "ok") return false;
    } else if (opts.estadoAuditor && r.estadoAuditoria !== opts.estadoAuditor) {
      return false;
    }

    if (opts.hallazgo && !r.hallazgos.some((h) => h.codigo === opts.hallazgo)) return false;

    return true;
  });
}

export default function AuditorDynamics({ onEstadoChange }: Props) {
  const { instance } = useInstance();
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [tipo, setTipo] = useState("");
  const [numero, setNumero] = useState("");
  const [estadoSII, setEstadoSII] = useState("");
  const [estadoEnvio, setEstadoEnvio] = useState("");
  const [soloTimbrados, setSoloTimbrados] = useState(true);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [bcDisponible, setBcDisponible] = useState<boolean | null>(null);
  const [bcDetalle, setBcDetalle] = useState<string | null>(null);

  const [buscarResultado, setBuscarResultado] = useState("");
  const [filtroEstadoAuditor, setFiltroEstadoAuditor] = useState("");
  const [filtroHallazgo, setFiltroHallazgo] = useState("");
  const [filtroEmpresaTabla, setFiltroEmpresaTabla] = useState("");
  const [filtroTipoTabla, setFiltroTipoTabla] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const [procesando, setProcesando] = useState(false);
  const [loteActual, setLoteActual] = useState(0);
  const [totalLotes, setTotalLotes] = useState(0);
  const [docsProcesados, setDocsProcesados] = useState(0);
  const [totalDocs, setTotalDocs] = useState(0);
  const [resultados, setResultados] = useState<ResultadoAuditorDocumento[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<{ ok: number; warning: number; error: number; omitidos: number } | null>(null);

  useEffect(() => {
    const h = hoy();
    setFechaDesde(h);
    setFechaHasta(h);
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function verificarBc() {
      try {
        let res = await fetch("/api/dynamics/status", { cache: "no-store" });
        let json = (await res.json().catch(() => ({}))) as { configurado?: boolean; detalle?: string };

        if (json.configurado !== true && json.configurado !== false) {
          res = await fetchWithInstance("/api/documento/auditor-dynamics?modo=config", {}, instance);
          json = (await res.json().catch(() => ({}))) as { configurado?: boolean; detalle?: string };
        }

        if (cancelado) return;

        if (json.configurado === true) {
          setBcDisponible(true);
          setBcDetalle(null);
        } else if (json.configurado === false) {
          setBcDisponible(false);
          setBcDetalle(json.detalle ?? "Revise DYNAMICS_* en .env.local del servidor.");
        } else {
          setBcDisponible(null);
          setBcDetalle(null);
        }
      } catch {
        if (!cancelado) {
          setBcDisponible(null);
          setBcDetalle(null);
        }
      }
    }

    verificarBc();

    return () => {
      cancelado = true;
    };
  }, [instance]);

  useEffect(() => {
    setResultados([]);
    setResumen(null);
    setError(null);
    setProcesando(false);
    setEmpresa("");
    setTipo("");
    setNumero("");
    setBuscarResultado("");
    setFiltroEstadoAuditor("");
    setFiltroHallazgo("");
    setFiltroEmpresaTabla("");
    setFiltroTipoTabla("");
    setPage(1);
  }, [instance]);

  useEffect(() => {
    fetchWithInstance("/api/empresas", {}, instance)
      .then((r) => r.json())
      .then((j) => setEmpresas(j.empresas ?? []))
      .catch(() => setEmpresas([]));
  }, [instance]);

  const rangoLabel = etiquetaRango(fechaDesde, fechaHasta);

  const filtrados = useMemo(
    () =>
      filtrarResultados(resultados, {
        buscar: buscarResultado,
        estadoAuditor: filtroEstadoAuditor,
        hallazgo: filtroHallazgo,
        empresa: filtroEmpresaTabla,
        tipo: filtroTipoTabla,
      }),
    [resultados, buscarResultado, filtroEstadoAuditor, filtroHallazgo, filtroEmpresaTabla, filtroTipoTabla],
  );

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginados = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtrados.slice(start, start + pageSize);
  }, [filtrados, page, pageSize]);

  const desde = filtrados.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, filtrados.length);

  const hayFiltrosTabla =
    !!buscarResultado ||
    !!filtroEstadoAuditor ||
    !!filtroHallazgo ||
    !!filtroEmpresaTabla ||
    !!filtroTipoTabla;

  useEffect(() => {
    setPage(1);
  }, [buscarResultado, filtroEstadoAuditor, filtroHallazgo, filtroEmpresaTabla, filtroTipoTabla, pageSize]);

  useEffect(() => {
    if (page > totalPaginas) setPage(totalPaginas);
  }, [page, totalPaginas]);

  useEffect(() => {
    const ok = !procesando && resumen && resumen.error === 0 && resumen.warning === 0;
    onEstadoChange?.({
      procesando,
      fecha: procesando || resultados.length ? rangoLabel : null,
      loteActual,
      totalLotes,
      docsProcesados,
      totalDocs,
      resultado:
        procesando || !resumen
          ? null
          : {
              ok: !!ok,
              text: `Auditoría ${rangoLabel}: ${resumen.ok} OK · ${resumen.warning} observaciones · ${resumen.error} diferencias · ${resumen.omitidos} omitidos`,
            },
    });
  }, [procesando, rangoLabel, loteActual, totalLotes, docsProcesados, totalDocs, resumen, resultados.length, onEstadoChange]);

  function buildParams(extra: Record<string, string>) {
    const params = new URLSearchParams({
      fechaDesde,
      fechaHasta,
      soloTimbrados: soloTimbrados ? "1" : "0",
      ...extra,
    });
    if (empresa) params.set("empresa", empresa);
    if (tipo) params.set("tipo", tipo);
    if (numero.trim()) params.set("numero", numero.trim());
    if (estadoSII) params.set("estadoSII", estadoSII);
    if (estadoEnvio) params.set("estadoEnvio", estadoEnvio);
    return params;
  }

  function validarRango(): string | null {
    if (!fechaDesde || !fechaHasta) return "Indique fecha desde y hasta.";
    if (fechaDesde > fechaHasta) return "La fecha desde no puede ser posterior a la fecha hasta.";
    return null;
  }

  function limpiarFiltrosTabla() {
    setBuscarResultado("");
    setFiltroEstadoAuditor("");
    setFiltroHallazgo("");
    setFiltroEmpresaTabla("");
    setFiltroTipoTabla("");
    setPage(1);
  }

  async function ejecutarAuditoria() {
    const rangoError = validarRango();
    if (rangoError) {
      setError(rangoError);
      return;
    }

    setProcesando(true);
    setError(null);
    setResultados([]);
    setResumen(null);
    setDocsProcesados(0);
    setLoteActual(0);
    limpiarFiltrosTabla();

    try {
      const countRes = await fetchWithInstance(
        `/api/documento/auditor-dynamics?${buildParams({ modo: "conteo" })}`,
        {},
        instance,
      );
      const countJson = await countRes.json();
      if (!countRes.ok || countJson.error) {
        throw new Error(countJson.error ?? countJson.detalle ?? "No se pudo contar documentos.");
      }

      const total = countJson.total ?? 0;
      setTotalDocs(total);
      if (total === 0) {
        setError("No hay documentos para auditar con los filtros seleccionados.");
        setProcesando(false);
        return;
      }

      const lotes = Math.ceil(total / AUDITOR_DYNAMICS_LOTE);
      setTotalLotes(lotes);
      const acumulado: ResultadoAuditorDocumento[] = [];

      for (let i = 0; i < lotes; i++) {
        setLoteActual(i + 1);
        const batchRes = await fetchWithInstance(
          `/api/documento/auditor-dynamics?${buildParams({
            offset: String(i * AUDITOR_DYNAMICS_LOTE),
            limit: String(AUDITOR_DYNAMICS_LOTE),
          })}`,
          {},
          instance,
        );
        const batchJson = await batchRes.json();
        if (!batchRes.ok || batchJson.error) {
          throw new Error(batchJson.error ?? `Error en lote ${i + 1}.`);
        }

        const nuevos = (batchJson.resultados ?? []) as ResultadoAuditorDocumento[];
        acumulado.push(...nuevos);
        setResultados([...acumulado]);
        setDocsProcesados(acumulado.length);
      }

      setResumen({
        ok: acumulado.filter((r) => r.estadoAuditoria === "ok").length,
        warning: acumulado.filter((r) => r.estadoAuditoria === "warning").length,
        error: acumulado.filter((r) => r.estadoAuditoria === "error").length,
        omitidos: acumulado.filter((r) => r.estadoAuditoria === "omitido").length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error en auditoría.");
    } finally {
      setProcesando(false);
    }
  }

  async function exportarExcel() {
    const sufijo = fechaDesde === fechaHasta ? fechaDesde : `${fechaDesde}_${fechaHasta}`;

    await downloadXlsxTable({
      filename: `auditor_dynamics_${sufijo}`,
      sheetName: "Auditoria",
      headers: [
        "Fecha emisión",
        "Tipo",
        "Folio",
        "Empresa",
        "Número BC",
        "Estado",
        "Hallazgos",
        "Líneas Gestión",
        "Líneas BC",
        "Total Gestión",
        "Total BC",
        "Estado BC",
      ],
      rows: filtrados.map((r) => [
        r.fechaEmision ?? "—",
        r.tipo,
        String(r.numero),
        r.empresaNombre,
        r.numeroBc,
        estadoLabel(r.estadoAuditoria),
        r.hallazgos.map((h) => h.mensaje).join(" | "),
        String(r.gestion.lineas),
        r.bc ? String(r.bc.lineas) : "—",
        String(r.gestion.total),
        r.bc?.total != null ? String(r.bc.total) : "—",
        r.bc?.estado ?? "—",
      ]),
    });
  }

  return (
    <div className="space-y-6">
      {bcDisponible === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Business Central no está configurado en el servidor.
          {bcDetalle ? ` ${bcDetalle}` : " Configure DYNAMICS_* en .env.local."}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 space-y-4">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Filtros de auditoría (SQL)</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Desde</span>
            <input
              type="date"
              value={fechaDesde}
              max={fechaHasta || undefined}
              onChange={(e) => setFechaDesde(e.target.value)}
              disabled={procesando}
              suppressHydrationWarning
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hasta</span>
            <input
              type="date"
              value={fechaHasta}
              min={fechaDesde || undefined}
              onChange={(e) => setFechaHasta(e.target.value)}
              disabled={procesando}
              suppressHydrationWarning
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Empresa</span>
            <select
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              disabled={procesando}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            >
              <option value="">Todas</option>
              {empresas.map((e) => (
                <option key={e.codEmpresa} value={e.codEmpresa}>
                  {e.descripcion}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tipo documento</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              disabled={procesando}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            >
              <option value="">Todos</option>
              <option value="BLE">BLE</option>
              <option value="FCV">FCV</option>
              <option value="NCV">NCV</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Folio / número</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej. 12345"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              disabled={procesando}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estado SII</span>
            <select
              value={estadoSII}
              onChange={(e) => setEstadoSII(e.target.value)}
              disabled={procesando}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            >
              <option value="">Todos</option>
              <option value="2">Timbrado (2)</option>
              <option value="0">Sin timbrar (0)</option>
              <option value="1">En proceso (1)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estado Dynamics</span>
            <select
              value={estadoEnvio}
              onChange={(e) => setEstadoEnvio(e.target.value)}
              disabled={procesando}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            >
              <option value="">Todos</option>
              <option value="0">Sin envío</option>
              <option value="1">Pendiente (1)</option>
              <option value="2">Parcial (2)</option>
              <option value="3">Registrado (3)</option>
            </select>
          </label>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={soloTimbrados}
                onChange={(e) => setSoloTimbrados(e.target.checked)}
                disabled={procesando}
                className="rounded border-zinc-300"
              />
              Solo timbrados SII
            </label>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={ejecutarAuditoria}
          disabled={procesando}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {procesando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {procesando ? `Auditando lote ${loteActual}/${totalLotes}…` : "Iniciar auditoría"}
        </button>
        {resultados.length > 0 && (
          <button
            type="button"
            onClick={exportarExcel}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            <Download className="w-4 h-4" />
            Exportar Excel ({filtrados.length})
          </button>
        )}
      </div>

      {procesando && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <p className="text-sm font-semibold text-indigo-950">
            Procesando {docsProcesados} de {totalDocs} documentos ({rangoLabel})…
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${totalDocs ? Math.round((docsProcesados / totalDocs) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {resumen && !procesando && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "ok", label: "OK", value: resumen.ok, border: "border-l-emerald-500", text: "text-emerald-700" },
            { key: "warning", label: "Observaciones", value: resumen.warning, border: "border-l-amber-500", text: "text-amber-700" },
            { key: "error", label: "Diferencias", value: resumen.error, border: "border-l-rose-500", text: "text-rose-700" },
            { key: "omitidos", label: "Omitidos", value: resumen.omitidos, border: "border-l-zinc-400", text: "text-zinc-700" },
          ].map((card) => (
            <div
              key={card.key}
              className={`rounded-xl border border-zinc-200 border-l-4 ${card.border} bg-white px-4 py-4 shadow-sm`}
            >
              <p className={`text-xs font-bold uppercase tracking-wide ${card.text}`}>{card.label}</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-zinc-900">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {resultados.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5" />
              Filtros de resultados ({filtrados.length} de {resultados.length})
            </p>
            {hayFiltrosTabla && (
              <button
                type="button"
                onClick={limpiarFiltrosTabla}
                className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="block lg:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Buscar</span>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Folio, tipo, empresa…"
                  value={buscarResultado}
                  onChange={(e) => setBuscarResultado(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2.5 text-sm text-zinc-900"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estado auditoría</span>
              <select
                value={filtroEstadoAuditor}
                onChange={(e) => setFiltroEstadoAuditor(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900"
              >
                <option value="">Todos</option>
                <option value="problemas">Con problemas</option>
                <option value="ok">OK</option>
                <option value="warning">Observación</option>
                <option value="error">Diferencia</option>
                <option value="omitido">Omitido</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hallazgo</span>
              <select
                value={filtroHallazgo}
                onChange={(e) => setFiltroHallazgo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900"
              >
                {HALLAZGO_OPCIONES.map((o) => (
                  <option key={o.value || "all"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Empresa en tabla</span>
              <select
                value={filtroEmpresaTabla}
                onChange={(e) => setFiltroEmpresaTabla(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900"
              >
                <option value="">Todas</option>
                {empresas.map((e) => (
                  <option key={e.codEmpresa} value={e.codEmpresa}>
                    {e.descripcion}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tipo en tabla</span>
              <select
                value={filtroTipoTabla}
                onChange={(e) => setFiltroTipoTabla(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900"
              >
                <option value="">Todos</option>
                <option value="BLE">BLE</option>
                <option value="FCV">FCV</option>
                <option value="NCV">NCV</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {filtrados.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">Fecha</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">Doc</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">Empresa</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">Estado</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase">Lín. G / BC</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase">Monto G / BC</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">Hallazgos</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map((r) => (
                  <tr key={`${r.tipo}-${r.numero}-${r.codEmpresa}`} className="border-t border-zinc-100 even:bg-zinc-50/60">
                    <td className="px-3 py-2.5 text-xs text-zinc-600 whitespace-nowrap">{r.fechaEmision ?? "—"}</td>
                    <td className="px-3 py-2.5 font-semibold text-zinc-900 whitespace-nowrap">
                      {r.tipo}-{r.numero}
                      <div className="text-[11px] font-normal text-zinc-500">{r.numeroBc}</div>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-700 text-xs">{r.empresaNombre}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${estadoBadge(r.estadoAuditoria)}`}>
                        {r.estadoAuditoria === "ok" && <CheckCircle2 className="w-3 h-3 mr-1 inline" />}
                        {r.estadoAuditoria === "warning" && <AlertTriangle className="w-3 h-3 mr-1 inline" />}
                        {r.estadoAuditoria === "error" && <AlertCircle className="w-3 h-3 mr-1 inline" />}
                        {estadoLabel(r.estadoAuditoria)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-800">
                      {r.gestion.lineas} / {r.bc?.lineas ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      <div>{formatMonto(r.gestion.total)}</div>
                      <div className="text-zinc-500">{formatMonto(r.bc?.total)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-700 max-w-md">
                      <ul className="space-y-1">
                        {r.hallazgos.map((h, i) => (
                          <li
                            key={i}
                            className={
                              h.severidad === "error"
                                ? "text-rose-800"
                                : h.severidad === "warning"
                                  ? "text-amber-800"
                                  : "text-emerald-800"
                            }
                          >
                            {h.mensaje}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-4 sm:px-6 bg-zinc-900 border-t border-zinc-800 flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Mostrando {desde}-{hasta} de {filtrados.length}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Filas</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-bold text-white px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center hover:bg-zinc-700 border border-zinc-700 disabled:opacity-30"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-3 h-9 bg-zinc-800 rounded-xl border border-zinc-700 flex items-center gap-1.5 text-[11px] font-bold text-white tabular-nums">
                  <span>{page}</span>
                  <span className="text-zinc-500 font-normal">de</span>
                  <span className="text-zinc-400">{totalPaginas}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
                  disabled={page >= totalPaginas}
                  className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center hover:bg-zinc-700 border border-zinc-700 disabled:opacity-30"
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {resultados.length > 0 && filtrados.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
          Ningún resultado coincide con los filtros aplicados.{" "}
          <button type="button" onClick={limpiarFiltrosTabla} className="font-semibold text-indigo-600 hover:underline">
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  );
}
