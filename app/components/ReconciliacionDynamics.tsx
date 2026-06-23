"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Play,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Filter,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useInstance, fetchWithInstance } from "./InstanceContext";
import { useAdminSession } from "./AdminSessionContext";
import { downloadXlsxTable } from "@/lib/exportUtils";
import {
  RECONCILIACION_APLICAR_MAX,
  RECONCILIACION_LOTE,
  type ReconciliacionItem,
} from "@/lib/reconciliacionDynamics.types";

type Empresa = { codEmpresa: string; descripcion: string };

export type ReconciliacionDynamicsEstado = {
  procesando: boolean;
  fecha: string | null;
  loteActual: number;
  totalLotes: number;
  docsProcesados: number;
  totalDocs: number;
  resultado: { ok: boolean; text: string } | null;
};

type Props = {
  onEstadoChange?: (estado: ReconciliacionDynamicsEstado) => void;
};

const PAGE_SIZES = [25, 50, 100, 200] as const;

const hoy = () => new Date().toISOString().slice(0, 10);

const ESTADO_GESTION_LABEL: Record<number, string> = {
  0: "Sin enviar",
  1: "Enviada",
  2: "Loc. OK",
  3: "Registrado",
  4: "Medio de pago",
};

function etiquetaRango(desde: string, hasta: string) {
  return desde === hasta ? desde : `${desde} → ${hasta}`;
}

function itemKey(r: ReconciliacionItem) {
  return `${r.tipo}-${r.idDocumento}`;
}

function formatMonto(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}

function badgeGestion(estado: number | null | undefined) {
  const e = estado ?? 0;
  if (e === 0) return "bg-slate-200 text-slate-900 ring-1 ring-slate-300";
  if (e === 1) return "bg-amber-100 text-amber-900 ring-1 ring-amber-200";
  if (e === 2) return "bg-sky-100 text-sky-900 ring-1 ring-sky-200";
  if (e === 3) return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200";
  if (e === 4) return "bg-indigo-100 text-indigo-900 ring-1 ring-indigo-200";
  return "bg-zinc-100 text-zinc-800 ring-1 ring-zinc-200";
}

function badgeCandidato(candidato: boolean) {
  return candidato
    ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
    : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200";
}

function filtrarResultados(
  resultados: ReconciliacionItem[],
  opts: {
    buscar: string;
    filtroCandidato: string;
    empresa: string;
    tipo: string;
    estadoGestion: string;
  },
): ReconciliacionItem[] {
  const q = opts.buscar.trim().toLowerCase();

  return resultados.filter((r) => {
    if (opts.empresa && r.codEmpresa !== opts.empresa) return false;
    if (opts.tipo && r.tipo !== opts.tipo) return false;

    if (opts.filtroCandidato === "si" && !r.candidato) return false;
    if (opts.filtroCandidato === "no" && r.candidato) return false;

    if (opts.estadoGestion !== "") {
      const eg = r.gestion.estadoEnvio ?? 0;
      if (String(eg) !== opts.estadoGestion) return false;
    }

    if (q) {
      const doc = `${r.tipo}-${r.numero}`.toLowerCase();
      const match =
        doc.includes(q) ||
        String(r.numero).includes(q) ||
        r.numeroBc.toLowerCase().includes(q) ||
        r.empresaNombre.toLowerCase().includes(q) ||
        (r.motivoExclusion ?? "").toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });
}

export default function ReconciliacionDynamics({ onEstadoChange }: Props) {
  const { instance } = useInstance();
  const { isAdmin, loading: sessionLoading } = useAdminSession();

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [tipo, setTipo] = useState("");
  const [numero, setNumero] = useState("");
  const [estadoObjetivo, setEstadoObjetivo] = useState("3");
  const [estadoEnvioMax, setEstadoEnvioMax] = useState("2");
  const [soloTimbrados, setSoloTimbrados] = useState(true);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [bcDisponible, setBcDisponible] = useState<boolean | null>(null);

  const [buscarResultado, setBuscarResultado] = useState("");
  const [filtroCandidato, setFiltroCandidato] = useState("si");
  const [filtroEmpresaTabla, setFiltroEmpresaTabla] = useState("");
  const [filtroTipoTabla, setFiltroTipoTabla] = useState("");
  const [filtroEstadoGestion, setFiltroEstadoGestion] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const [procesando, setProcesando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [loteActual, setLoteActual] = useState(0);
  const [totalLotes, setTotalLotes] = useState(0);
  const [docsProcesados, setDocsProcesados] = useState(0);
  const [totalDocs, setTotalDocs] = useState(0);
  const [resultados, setResultados] = useState<ReconciliacionItem[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; text: string } | null>(null);
  const [resumen, setResumen] = useState<{ candidatos: number; excluidos: number } | null>(null);

  useEffect(() => {
    const h = hoy();
    setFechaDesde(h);
    setFechaHasta(h);
  }, []);

  useEffect(() => {
    fetchWithInstance("/api/dynamics/status", {}, instance)
      .then((r) => r.json())
      .then((j) => setBcDisponible(j.configurado === true))
      .catch(() => setBcDisponible(null));
  }, [instance]);

  useEffect(() => {
    fetchWithInstance("/api/empresas", {}, instance)
      .then((r) => r.json())
      .then((j) => setEmpresas(j.empresas ?? []))
      .catch(() => setEmpresas([]));
  }, [instance]);

  const rangoLabel = etiquetaRango(fechaDesde, fechaHasta);
  const candidatos = useMemo(() => resultados.filter((r) => r.candidato), [resultados]);

  const filtrados = useMemo(
    () =>
      filtrarResultados(resultados, {
        buscar: buscarResultado,
        filtroCandidato,
        empresa: filtroEmpresaTabla,
        tipo: filtroTipoTabla,
        estadoGestion: filtroEstadoGestion,
      }),
    [resultados, buscarResultado, filtroCandidato, filtroEmpresaTabla, filtroTipoTabla, filtroEstadoGestion],
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
    filtroCandidato !== "si" ||
    !!filtroEmpresaTabla ||
    !!filtroTipoTabla ||
    !!filtroEstadoGestion;

  useEffect(() => {
    setPage(1);
  }, [buscarResultado, filtroCandidato, filtroEmpresaTabla, filtroTipoTabla, filtroEstadoGestion, pageSize]);

  useEffect(() => {
    if (page > totalPaginas) setPage(totalPaginas);
  }, [page, totalPaginas]);

  useEffect(() => {
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
              ok: resumen.candidatos > 0,
              text: `Reconciliación ${rangoLabel}: ${resumen.candidatos} candidato(s) · ${resumen.excluidos} excluido(s)`,
            },
    });
  }, [
    procesando,
    rangoLabel,
    loteActual,
    totalLotes,
    docsProcesados,
    totalDocs,
    resumen,
    resultados.length,
    onEstadoChange,
  ]);

  function buildParams(extra: Record<string, string>) {
    const params = new URLSearchParams({
      fechaDesde,
      fechaHasta,
      soloTimbrados: soloTimbrados ? "1" : "0",
      soloCandidatos: "0",
      estadoObjetivo,
      estadoEnvioMax,
      ...extra,
    });
    if (empresa) params.set("empresa", empresa);
    if (tipo) params.set("tipo", tipo);
    if (numero.trim()) params.set("numero", numero.trim());
    return params;
  }

  function validarRango(): string | null {
    if (!fechaDesde || !fechaHasta) return "Indique fecha desde y hasta.";
    if (fechaDesde > fechaHasta) return "La fecha desde no puede ser posterior a la fecha hasta.";
    return null;
  }

  function limpiarFiltrosTabla() {
    setBuscarResultado("");
    setFiltroCandidato("si");
    setFiltroEmpresaTabla("");
    setFiltroTipoTabla("");
    setFiltroEstadoGestion("");
    setPage(1);
  }

  function limpiarAlBuscar() {
    limpiarFiltrosTabla();
    setSeleccionados(new Set());
    setResultados([]);
    setResumen(null);
    setMensaje(null);
    setError(null);
  }

  async function buscarDesincronizados() {
    const rangoError = validarRango();
    if (rangoError) {
      setError(rangoError);
      return;
    }

    setProcesando(true);
    setAplicando(false);
    limpiarAlBuscar();
    setDocsProcesados(0);
    setLoteActual(0);

    try {
      const countRes = await fetchWithInstance(
        `/api/documento/reconciliacion-dynamics?${buildParams({ modo: "conteo" })}`,
        {},
        instance,
      );
      const countJson = await countRes.json();
      if (!countRes.ok || countJson.error) {
        throw new Error(countJson.error ?? "No se pudo contar documentos.");
      }

      const total = countJson.total ?? 0;
      setTotalDocs(total);
      if (total === 0) {
        setError("No hay documentos en el rango con los filtros seleccionados.");
        setProcesando(false);
        return;
      }

      const lotes = Math.ceil(total / RECONCILIACION_LOTE);
      setTotalLotes(lotes);
      const acumulado: ReconciliacionItem[] = [];

      for (let i = 0; i < lotes; i++) {
        setLoteActual(i + 1);
        const batchRes = await fetchWithInstance(
          `/api/documento/reconciliacion-dynamics?${buildParams({
            offset: String(i * RECONCILIACION_LOTE),
            limit: String(RECONCILIACION_LOTE),
          })}`,
          {},
          instance,
        );
        const batchJson = await batchRes.json();
        if (!batchRes.ok || batchJson.error) {
          throw new Error(batchJson.error ?? `Error en lote ${i + 1}.`);
        }
        acumulado.push(...(batchJson.resultados ?? []));
        setDocsProcesados(acumulado.length);
        setResultados([...acumulado]);
      }

      const cand = acumulado.filter((r) => r.candidato);
      setSeleccionados(new Set(cand.map(itemKey)));
      setResumen({
        candidatos: cand.length,
        excluidos: acumulado.length - cand.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error en la búsqueda.");
    } finally {
      setProcesando(false);
    }
  }

  function toggleSeleccion(key: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSeleccionPagina() {
    const keysPagina = paginados.filter((r) => r.candidato).map(itemKey);
    const todosMarcados = keysPagina.length > 0 && keysPagina.every((k) => seleccionados.has(k));
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (todosMarcados) {
        keysPagina.forEach((k) => next.delete(k));
      } else {
        keysPagina.forEach((k) => next.add(k));
      }
      return next;
    });
  }

  function seleccionarTodosCandidatos() {
    setSeleccionados(new Set(candidatos.map(itemKey)));
  }

  function limpiarSeleccion() {
    setSeleccionados(new Set());
  }

  async function aplicarSincronizacion() {
    if (!isAdmin) {
      setMensaje({ ok: false, text: "Requiere sesión de administrador." });
      return;
    }

    const docs = resultados.filter((r) => seleccionados.has(itemKey(r)) && r.candidato);
    if (docs.length === 0) {
      setMensaje({ ok: false, text: "Seleccione al menos un candidato para sincronizar." });
      return;
    }

    setAplicando(true);
    setMensaje(null);
    setError(null);

    try {
      let exitosos = 0;
      let fallidos = 0;
      const fallos: string[] = [];

      for (let i = 0; i < docs.length; i += RECONCILIACION_APLICAR_MAX) {
        const lote = docs.slice(i, i + RECONCILIACION_APLICAR_MAX);
        const res = await fetchWithInstance(
          "/api/documento/reconciliacion-dynamics",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              estadoObjetivo: Number(estadoObjetivo),
              documentos: lote.map((d) => ({
                idDocumento: d.idDocumento,
                tipo: d.tipo,
                numero: d.numero,
                idBcDynamics: d.idBcDynamics,
              })),
            }),
          },
          instance,
        );
        const json = await res.json();
        if (!res.ok && !json.resultados) {
          throw new Error(json.error ?? "Error al aplicar sincronización.");
        }
        for (const r of json.resultados ?? []) {
          if (r.ok) exitosos++;
          else {
            fallidos++;
            fallos.push(`${r.tipo}-${r.numero}: ${r.error ?? "Error"}`);
          }
        }
      }

      setMensaje({
        ok: fallidos === 0,
        text:
          fallidos === 0
            ? `${exitosos} documento(s) actualizado(s) a estado ${estadoObjetivo}.`
            : `${exitosos} OK, ${fallidos} error(es). ${fallos.slice(0, 3).join(" · ")}`,
      });

      if (exitosos > 0) {
        await buscarDesincronizados();
      }
    } catch (e) {
      setMensaje({ ok: false, text: e instanceof Error ? e.message : "Error al aplicar." });
    } finally {
      setAplicando(false);
    }
  }

  async function exportarExcel() {
    const sufijo = fechaDesde === fechaHasta ? fechaDesde : `${fechaDesde}_${fechaHasta}`;
    await downloadXlsxTable({
      filename: `reconciliacion_dynamics_${sufijo}`,
      sheetName: "Reconciliacion",
      headers: [
        "Candidato",
        "Fecha",
        "Tipo",
        "Folio",
        "Empresa",
        "Estado Gestión",
        "Estado objetivo",
        "Número BC",
        "Estado BC",
        "Motivo exclusión",
        "Líneas Gestión",
        "Líneas BC",
        "Total Gestión",
        "Total BC",
      ],
      rows: filtrados.map((r) => [
        r.candidato ? "Sí" : "No",
        r.fechaEmision ?? "—",
        r.tipo,
        String(r.numero),
        r.empresaNombre,
        ESTADO_GESTION_LABEL[r.gestion.estadoEnvio ?? 0] ?? String(r.gestion.estadoEnvio ?? "—"),
        String(r.estadoPropuesto),
        r.numeroBc,
        r.bc?.estado ?? "—",
        r.motivoExclusion ?? "—",
        String(r.gestion.lineas),
        r.bc ? String(r.bc.lineas) : "—",
        String(r.gestion.total),
        r.bc?.total != null ? String(r.bc.total) : "—",
      ]),
    });
  }

  const bloqueado = procesando || aplicando;
  const keysCandidatosPagina = paginados.filter((r) => r.candidato).map(itemKey);
  const paginaCompletaSeleccionada =
    keysCandidatosPagina.length > 0 && keysCandidatosPagina.every((k) => seleccionados.has(k));

  return (
    <div className="space-y-6">
      {bcDisponible === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Business Central no está configurado. Configure DYNAMICS_* en el servidor.
        </div>
      )}

      {!sessionLoading && !isAdmin && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-zinc-500" />
          La búsqueda está disponible para todos. Aplicar cambios de estado requiere sesión de administrador.
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Desde</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              disabled={bloqueado}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hasta</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              disabled={bloqueado}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Empresa</span>
            <select
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              disabled={bloqueado}
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
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              disabled={bloqueado}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            >
              <option value="">Todos</option>
              <option value="BLE">BLE</option>
              <option value="FCV">FCV</option>
              <option value="NCV">NCV</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Folio</span>
            <input
              type="text"
              placeholder="Opcional"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              disabled={bloqueado}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estado Gestión máx.</span>
            <select
              value={estadoEnvioMax}
              onChange={(e) => setEstadoEnvioMax(e.target.value)}
              disabled={bloqueado}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            >
              <option value="0">Sin envío (0)</option>
              <option value="1">Hasta enviada (1)</option>
              <option value="2">Hasta loc. OK (2)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Marcar como estado</span>
            <select
              value={estadoObjetivo}
              onChange={(e) => setEstadoObjetivo(e.target.value)}
              disabled={bloqueado}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900"
            >
              <option value="3">Registrado (3)</option>
              <option value="4">Medio de pago (4)</option>
              <option value="2">Loc. OK (2)</option>
            </select>
          </label>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={soloTimbrados}
                onChange={(e) => setSoloTimbrados(e.target.checked)}
                disabled={bloqueado}
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
          onClick={buscarDesincronizados}
          disabled={bloqueado}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {procesando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {procesando ? `Comparando ${docsProcesados}/${totalDocs}…` : "Buscar desincronizados"}
        </button>

        {resultados.length > 0 && (
          <>
            <button
              type="button"
              onClick={exportarExcel}
              disabled={bloqueado}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              <Download className="w-4 h-4" />
              Exportar ({filtrados.length})
            </button>

            {isAdmin && candidatos.length > 0 && (
              <button
                type="button"
                onClick={aplicarSincronizacion}
                disabled={bloqueado || seleccionados.size === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {aplicando ? "Aplicando…" : `Sincronizar estado (${seleccionados.size})`}
              </button>
            )}
          </>
        )}
      </div>

      {procesando && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <p className="text-sm font-semibold text-indigo-950">
            Comparando con BC: lote {loteActual}/{totalLotes} · {docsProcesados}/{totalDocs} documentos
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

      {mensaje && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${
            mensaje.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {mensaje.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          {mensaje.text}
        </div>
      )}

      {resumen && !procesando && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { key: "candidatos", label: "Candidatos", value: resumen.candidatos, border: "border-l-emerald-500", text: "text-emerald-700" },
            { key: "excluidos", label: "Excluidos", value: resumen.excluidos, border: "border-l-zinc-400", text: "text-zinc-600" },
            { key: "seleccionados", label: "Seleccionados", value: seleccionados.size, border: "border-l-violet-500", text: "text-violet-700" },
            { key: "filtrados", label: "En tabla", value: filtrados.length, border: "border-l-indigo-500", text: "text-indigo-700" },
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
                  placeholder="Folio, tipo, empresa, motivo…"
                  value={buscarResultado}
                  onChange={(e) => setBuscarResultado(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2.5 text-sm text-zinc-900"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Candidato</span>
              <select
                value={filtroCandidato}
                onChange={(e) => setFiltroCandidato(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900"
              >
                <option value="">Todos</option>
                <option value="si">Solo candidatos</option>
                <option value="no">Excluidos</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estado Gestión</span>
              <select
                value={filtroEstadoGestion}
                onChange={(e) => setFiltroEstadoGestion(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900"
              >
                <option value="">Todos</option>
                <option value="0">Sin enviar (0)</option>
                <option value="1">Enviada (1)</option>
                <option value="2">Loc. OK (2)</option>
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
          {isAdmin && candidatos.length > 0 && (
            <div className="flex flex-wrap gap-3 text-xs font-semibold pt-1">
              <button type="button" onClick={seleccionarTodosCandidatos} className="text-indigo-600 hover:underline">
                Seleccionar todos los candidatos ({candidatos.length})
              </button>
              <button type="button" onClick={limpiarSeleccion} className="text-zinc-600 hover:underline">
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}

      {filtrados.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-white">
                  {isAdmin && (
                    <th className="px-3 py-2.5 w-10">
                      {keysCandidatosPagina.length > 0 && (
                        <input
                          type="checkbox"
                          checked={paginaCompletaSeleccionada}
                          onChange={toggleSeleccionPagina}
                          disabled={bloqueado}
                          className="rounded border-zinc-500"
                          title="Seleccionar candidatos de esta página"
                        />
                      )}
                    </th>
                  )}
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">Fecha</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">Documento</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">Empresa</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">Gestión</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">BC</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase">Lín. G / BC</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase">Monto G / BC</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map((r) => {
                  const key = itemKey(r);
                  return (
                    <tr key={key} className="border-t border-zinc-100 even:bg-zinc-50/60">
                      {isAdmin && (
                        <td className="px-3 py-2.5">
                          {r.candidato ? (
                            <input
                              type="checkbox"
                              checked={seleccionados.has(key)}
                              onChange={() => toggleSeleccion(key)}
                              disabled={bloqueado}
                              className="rounded border-zinc-300"
                            />
                          ) : null}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-xs text-zinc-600 whitespace-nowrap">{r.fechaEmision ?? "—"}</td>
                      <td className="px-3 py-2.5 font-semibold text-zinc-900 whitespace-nowrap">
                        {r.tipo}-{r.numero}
                        <div className="text-[11px] font-normal text-zinc-500">{r.numeroBc}</div>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-700 text-xs max-w-[160px] truncate" title={r.empresaNombre}>
                        {r.empresaNombre}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${badgeGestion(r.gestion.estadoEnvio)}`}>
                          {ESTADO_GESTION_LABEL[r.gestion.estadoEnvio ?? 0] ?? r.gestion.estadoEnvio}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${badgeCandidato(r.candidato)}`}>
                          {r.candidato ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : r.estadoAuditoria === "warning" ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {r.candidato ? "OK en BC" : r.bc?.estado ?? "Excluido"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-800">
                        {r.gestion.lineas} / {r.bc?.lineas ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                        <div>{formatMonto(r.gestion.total)}</div>
                        <div className="text-zinc-500">{formatMonto(r.bc?.total)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-700 max-w-xs">
                        {r.candidato ? (
                          <span className="text-emerald-800">Pendiente sincronizar en Gestión</span>
                        ) : (
                          <span className="text-zinc-600" title={r.motivoExclusion ?? ""}>
                            {r.motivoExclusion ?? "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
