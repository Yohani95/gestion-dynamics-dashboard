"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useInstance, fetchWithInstance } from "./InstanceContext";
import type { IntegridadNivel, IntegridadReporte } from "@/lib/integridadVenta";
import { labelEstadoDynamics } from "@/lib/integridadVenta";
import type { BcDocumentoVista, DynamicsODataVerificacion } from "@/lib/dynamicsOData";

type Props = {
  numero: string;
  tipo?: string;
  empresa?: string;
};

type ErrorDyn = { mensaje?: string; error?: string };

const nivelStyles: Record<
  IntegridadNivel,
  { border: string; bg: string; badge: string; icon: typeof CheckCircle2 }
> = {
  ok: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    badge: "bg-emerald-700 text-white",
    icon: CheckCircle2,
  },
  warning: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    badge: "bg-amber-700 text-white",
    icon: AlertTriangle,
  },
  error: {
    border: "border-rose-200",
    bg: "bg-rose-50",
    badge: "bg-rose-700 text-white",
    icon: XCircle,
  },
};

const checkIcon = (nivel: IntegridadNivel) => {
  if (nivel === "ok") return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (nivel === "warning") return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />;
  return <XCircle className="w-4 h-4 text-rose-600 shrink-0" />;
};

function formatMonto(monto?: number, moneda = "CLP") {
  if (monto == null || Number.isNaN(monto)) return "—";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 0,
  }).format(monto);
}

function BcVistaCard({ vista }: { vista: BcDocumentoVista }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs font-medium text-slate-500">Número en BC</dt>
          <dd className="font-semibold text-slate-900">{vista.numeroBc}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs font-medium text-slate-500">Estado</dt>
          <dd className="font-semibold text-slate-900">{vista.estadoLabel}</dd>
        </div>
        {vista.cliente && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
            <dt className="text-xs font-medium text-slate-500">Cliente</dt>
            <dd className="font-semibold text-slate-900">
              {vista.cliente}
              {vista.rutCliente ? ` · ${vista.rutCliente}` : ""}
            </dd>
          </div>
        )}
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs font-medium text-slate-500">Fecha</dt>
          <dd className="font-semibold text-slate-900">{vista.fecha ?? "—"}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs font-medium text-slate-500">Total</dt>
          <dd className="font-semibold text-slate-900">{formatMonto(vista.montoTotal, vista.moneda)}</dd>
        </div>
      </dl>

      {vista.lineas.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-indigo-200/80 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-indigo-600 text-white">
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">#</th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Producto</th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Descripción</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">Cant.</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">Precio</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">Monto</th>
              </tr>
            </thead>
            <tbody>
              {vista.lineas.map((linea, index) => (
                <tr
                  key={String(linea.secuencia)}
                  className={`border-t border-indigo-100/80 text-zinc-900 ${
                    index % 2 === 0 ? "bg-white" : "bg-indigo-50/40"
                  }`}
                >
                  <td className="px-3 py-2.5 tabular-nums text-zinc-600">{linea.secuencia}</td>
                  <td className="px-3 py-2.5 font-medium text-indigo-950">{linea.producto ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-700">{linea.descripcion ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{linea.cantidad ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-700">
                    {linea.precioUnitario != null ? formatMonto(linea.precioUnitario, vista.moneda) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-indigo-950">
                    {linea.monto != null ? formatMonto(linea.monto, vista.moneda) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-indigo-200 bg-indigo-50/80">
                <td colSpan={5} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-900">
                  Total documento BC
                </td>
                <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums text-indigo-950">
                  {formatMonto(vista.montoTotal, vista.moneda)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-600">El documento existe en BC pero no trae líneas en la consulta.</p>
      )}
    </div>
  );
}

export default function IntegridadDynamicsPanel({ numero, tipo, empresa }: Props) {
  const { instance } = useInstance();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [integridad, setIntegridad] = useState<IntegridadReporte | null>(null);
  const [erroresDynamics, setErroresDynamics] = useState<ErrorDyn[]>([]);
  const [dynamicsBcDisponible, setDynamicsBcDisponible] = useState(false);
  const [erroresAbierto, setErroresAbierto] = useState(false);

  const [bcAbierto, setBcAbierto] = useState(false);
  const [bcLoading, setBcLoading] = useState(false);
  const [bcError, setBcError] = useState<string | null>(null);
  const [bcData, setBcData] = useState<DynamicsODataVerificacion | null>(null);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams({ numero });
    if (tipo?.trim()) params.set("tipo", tipo.trim());
    if (empresa?.trim()) params.set("empresa", empresa.trim());
    return params;
  }, [numero, tipo, empresa]);

  useEffect(() => {
    if (!numero.trim()) return;
    setLoading(true);
    setError(null);
    setBcAbierto(false);
    setBcData(null);
    setBcError(null);

    fetchWithInstance(`/api/documento/integridad?${buildParams()}`, {}, instance)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.error) {
          setError(json.error ?? "No se pudo evaluar la integridad.");
          setIntegridad(null);
          return;
        }
        setIntegridad(json.integridad ?? null);
        setErroresDynamics(json.erroresDynamics ?? []);
        setDynamicsBcDisponible(!!json.dynamicsBcDisponible);
      })
      .catch(() => {
        setError("Error al cargar la integridad.");
        setIntegridad(null);
      })
      .finally(() => setLoading(false));
  }, [numero, tipo, empresa, instance, buildParams]);

  const consultarBc = async () => {
    if (bcData) {
      setBcAbierto((v) => !v);
      return;
    }
    setBcLoading(true);
    setBcError(null);
    setBcAbierto(true);

    try {
      const res = await fetchWithInstance(`/api/documento/dynamics-bc?${buildParams()}`, {}, instance);
      const json = await res.json();
      if (!res.ok || json.error) {
        setBcError(json.error ?? "No se pudo consultar Business Central.");
        setBcData(null);
        return;
      }
      setBcData(json.dynamicsBc ?? null);
    } catch {
      setBcError("Error de conexión al consultar Business Central.");
      setBcData(null);
    } finally {
      setBcLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
        <Loader2 className="w-4 h-4 animate-spin" />
        Revisando integración con Dynamics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        {error}
      </div>
    );
  }

  if (!integridad) return null;

  const style = nivelStyles[integridad.nivel];
  const HeaderIcon = style.icon;
  const lineasConProblema = integridad.lineas.filter((l) => l.nivel !== "ok");

  return (
    <div className={`rounded-2xl border ${style.border} ${style.bg} p-5 md:p-6 space-y-5`}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white/80 p-2 shadow-sm">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-zinc-900">Estado de integración</h4>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${style.badge}`}
            >
              <HeaderIcon className="w-3.5 h-3.5" />
              {integridad.nivel === "ok" ? "OK" : integridad.nivel === "warning" ? "Parcial" : "Revisar"}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-zinc-900 leading-snug">{integridad.resumen}</p>
          <p className="mt-2 text-xs text-zinc-800">
            Líneas sincronizadas: <strong>{integridad.lineasDynamicsOk}</strong> de{" "}
            <strong>{integridad.lineasGestion}</strong>
          </p>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {integridad.checks.map((check) => (
          <li
            key={check.id}
            className="flex items-start gap-2 rounded-xl border border-white/80 bg-white/80 px-3 py-2.5 text-sm"
          >
            {checkIcon(check.nivel)}
            <div className="min-w-0">
              <p className="font-semibold text-zinc-900">{check.titulo}</p>
              <p className="text-xs text-zinc-700 break-words">{check.detalle}</p>
            </div>
          </li>
        ))}
      </ul>

      {erroresDynamics.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-white/90 overflow-hidden">
          <button
            type="button"
            onClick={() => setErroresAbierto((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-rose-900 hover:bg-rose-50/50"
          >
            <span>Ver detalle de errores ({erroresDynamics.length})</span>
            {erroresAbierto ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
          </button>
          {erroresAbierto && (
            <ul className="border-t border-rose-100 px-4 py-3 space-y-2 max-h-48 overflow-y-auto">
              {erroresDynamics.map((err, i) => (
                <li key={i} className="text-xs text-rose-950 rounded-lg bg-rose-50 px-3 py-2">
                  {err.mensaje && <p className="font-medium">{err.mensaje}</p>}
                  {err.error && <p className="mt-1 text-rose-800 break-words whitespace-pre-wrap">{err.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {lineasConProblema.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-amber-200/80 bg-white shadow-sm">
          <p className="px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-50/80 border-b border-amber-100">
            Líneas con observaciones en Gestión
          </p>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-amber-600 text-white">
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Línea</th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Estado</th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {lineasConProblema.map((l, index) => (
                <tr
                  key={l.nroLinea}
                  className={`border-t border-amber-100/80 text-zinc-900 ${
                    index % 2 === 0 ? "bg-white" : "bg-amber-50/30"
                  }`}
                >
                  <td className="px-3 py-2.5 font-semibold tabular-nums">{l.nroLinea}</td>
                  <td className="px-3 py-2.5 text-amber-950">{labelEstadoDynamics(l.estado)}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-700">{l.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dynamicsBcDisponible && (
        <div className="rounded-xl border border-zinc-300 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={consultarBc}
            disabled={bcLoading}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-zinc-50 disabled:opacity-70"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                {bcLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-700" />
                ) : (
                  <ExternalLink className="w-4 h-4 text-indigo-700" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-900">Ver en Business Central</p>
                <p className="text-xs font-medium text-zinc-600 mt-0.5">
                  Consulta opcional en vivo: cabecera y detalle del documento en BC.
                </p>
              </div>
            </div>
            {!bcLoading && (
              bcAbierto ? (
                <ChevronUp className="w-5 h-5 shrink-0 text-zinc-500" />
              ) : (
                <ChevronDown className="w-5 h-5 shrink-0 text-zinc-500" />
              )
            )}
          </button>

          {bcAbierto && (
            <div className="border-t border-zinc-200 bg-zinc-50/50 px-4 py-4">
              {bcLoading && (
                <p className="text-sm text-zinc-700 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Consultando Business Central…
                </p>
              )}
              {bcError && <p className="text-sm text-rose-800">{bcError}</p>}
              {!bcLoading && bcData && (
                <>
                  {!bcData.tokenOk ? (
                    <p className="text-sm text-rose-800">{bcData.error ?? "No se pudo autenticar con BC."}</p>
                  ) : bcData.encontrado && bcData.vista ? (
                    <BcVistaCard vista={bcData.vista} />
                  ) : (
                    <p className="text-sm text-amber-900">
                      {bcData.resumen ?? bcData.error ?? "No se encontró el documento en Business Central."}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
