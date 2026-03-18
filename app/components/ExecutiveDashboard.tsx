"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { fetchWithInstance, useInstance } from "./InstanceContext";

type DashboardResumenResponse = {
  fechaCorte: string;
  timezone: "America/Santiago";
  ventas: {
    sinEnviarHoy: number;
    registradasHoy: number;
  };
  transferencias: {
    errores3Dias: number;
    abiertas: number;
  };
  jobs: {
    running: number;
    failed24h: number;
    longRunning: number;
    totalJobs: number;
    topFailed: Array<{
      name: string;
      lastRunAt: string | null;
      lastDurationSec: number | null;
    }>;
  };
  topIncidencias: Array<{
    traspaso: string;
    tipo: "D" | "R" | string;
    estadoSat: string;
    fechaErrorBc: string | null;
    motivoPrincipal: string;
  }>;
};

function formatDateTime(value: string | null) {
  if (!value) return "--";
  const sqlDateMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/,
  );
  if (sqlDateMatch) {
    const [, year, month, day, hour, minute] = sqlDateMatch;
    return `${day}-${month}-${year.slice(2)}, ${hour}:${minute}`;
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) return value;
  return dateValue.toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatDuration(seconds: number | null) {
  if (seconds === null || Number.isNaN(seconds)) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ExecutiveDashboard() {
  const { instance, instanceName, supportsTransferencias } = useInstance();
  const [data, setData] = useState<DashboardResumenResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (loadInFlightRef.current) {
        return;
      }
      loadInFlightRef.current = true;

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);
      try {
        const response = await fetchWithInstance("/api/dashboard/resumen", {}, instance);
        const json = (await response.json()) as DashboardResumenResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(json.error ?? "No fue posible cargar el resumen ejecutivo.");
        }

        setData(json);
        setLastUpdatedAt(
          new Date().toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        );
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Error inesperado al obtener el dashboard.";
        setError(message);
      } finally {
        loadInFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [instance],
  );

  useEffect(() => {
    void loadData("initial");

    const runRefresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void loadData("refresh");
    };

    const intervalId = window.setInterval(() => {
      runRefresh();
    }, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadData]);

  const cards = useMemo(
    () => {
      const baseCards = [
        {
          key: "sin-enviar",
          title: "Ventas sin enviar (hoy)",
          value: data?.ventas.sinEnviarHoy ?? 0,
          icon: Clock3,
          tone: "text-amber-700 bg-amber-50 border-amber-100",
        },
        {
          key: "registradas",
          title: "Ventas registradas (hoy)",
          value: data?.ventas.registradasHoy ?? 0,
          icon: CheckCircle2,
          tone: "text-emerald-700 bg-emerald-50 border-emerald-100",
        },
      ];

      if (!supportsTransferencias) {
        return baseCards;
      }

      return [
        ...baseCards,
        {
          key: "errores",
          title: "Transferencias con error (3 dias)",
          value: data?.transferencias.errores3Dias ?? 0,
          icon: AlertTriangle,
          tone: "text-rose-700 bg-rose-50 border-rose-100",
        },
        {
          key: "abiertas",
          title: "Transferencias abiertas",
          value: data?.transferencias.abiertas ?? 0,
          icon: TrendingUp,
          tone: "text-indigo-700 bg-indigo-50 border-indigo-100",
        },
      ];
    },
    [data, supportsTransferencias],
  );

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Vista Ejecutiva
            </p>
            <h3 className="mt-1 text-xl font-bold text-zinc-900">
              Resumen operativo de hoy
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              Instancia: <span className="font-semibold text-zinc-900">{instanceName}</span> | Fecha
              de corte: <span className="font-semibold text-zinc-900">{data?.fechaCorte ?? "--"}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData("refresh")}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar ahora
            </button>
            <Link
              href="/ventas"
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
            >
              Ir a Ventas
              <ArrowRight className="h-4 w-4" />
            </Link>
            {supportsTransferencias && (
              <Link
                href="/transferencias"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                Ir a Transferencias
                <ArrowRightLeft className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>

        {lastUpdatedAt && (
          <p className="mt-3 text-xs text-zinc-500">Ultima actualizacion: {lastUpdatedAt}</p>
        )}
      </div>

      <div
        className={`grid gap-4 sm:grid-cols-2 ${
          supportsTransferencias ? "xl:grid-cols-4" : "xl:grid-cols-2"
        }`}
      >
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.key}
              className={`rounded-2xl border p-4 shadow-sm ${card.tone}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em]">
                    {card.title}
                  </p>
                  <p className="mt-3 text-3xl font-black tabular-nums">{card.value}</p>
                </div>
                <div className="rounded-xl bg-white/70 p-2">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {supportsTransferencias && (
        <div className="rounded-3xl border border-zinc-200/70 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div>
              <h4 className="text-base font-bold text-zinc-900">Top incidencias (10)</h4>
              <p className="text-sm text-zinc-500">
                Transferencias con error detectadas en los ultimos 3 dias
              </p>
            </div>
            {refreshing && (
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Actualizando...
              </span>
            )}
          </header>

          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Cargando resumen ejecutivo...</div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-rose-700">{error}</p>
              <button
                type="button"
                onClick={() => void loadData("initial")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
              >
                Reintentar
              </button>
            </div>
          ) : data && data.topIncidencias.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Traspaso</th>
                    <th className="px-5 py-3 text-left font-semibold">Tipo</th>
                    <th className="px-5 py-3 text-left font-semibold">Estado SAT</th>
                    <th className="px-5 py-3 text-left font-semibold">Fecha error BC</th>
                    <th className="px-5 py-3 text-left font-semibold">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.topIncidencias.map((item) => (
                    <tr key={`${item.traspaso}-${item.tipo}`} className="hover:bg-zinc-50/80">
                      <td className="px-5 py-3 font-semibold text-zinc-900">{item.traspaso}</td>
                      <td className="px-5 py-3 text-zinc-700">{item.tipo}</td>
                      <td className="px-5 py-3 text-zinc-700">{item.estadoSat}</td>
                      <td className="px-5 py-3 text-zinc-600">{formatDateTime(item.fechaErrorBc)}</td>
                      <td className="px-5 py-3 text-zinc-700">{item.motivoPrincipal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm font-medium text-zinc-500">
              Sin incidencias activas para el periodo configurado.
            </div>
          )}
        </div>
      )}

      <div className="rounded-3xl border border-zinc-200/70 bg-white shadow-sm">
        <header className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-bold text-zinc-900">Resumen Jobs (Avanzados)</h4>
            <p className="text-sm text-zinc-500">
              Vista rapida separada del operativo principal
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              Corriendo: {data?.jobs.running ?? 0}
            </span>
            <span className="inline-flex items-center rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              Fallidos 24h: {data?.jobs.failed24h ?? 0}
            </span>
            <Link
              href="/advanced/jobs"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              Ver Jobs
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="p-6 text-center text-sm text-zinc-500">Cargando jobs...</div>
        ) : error ? (
          <div className="p-6 text-center text-sm font-semibold text-rose-700">
            No fue posible cargar el resumen de jobs.
          </div>
        ) : data && data.jobs.topFailed.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Job caido</th>
                  <th className="px-5 py-3 text-left font-semibold">Ultimo fallo</th>
                  <th className="px-5 py-3 text-left font-semibold">Duracion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.jobs.topFailed.slice(0, 3).map((job) => (
                  <tr key={`${job.name}-${job.lastRunAt}`} className="hover:bg-zinc-50/80">
                    <td className="px-5 py-3 font-semibold text-zinc-900">{job.name}</td>
                    <td className="px-5 py-3 text-zinc-600">{formatDateTime(job.lastRunAt)}</td>
                    <td className="px-5 py-3 text-zinc-600">{formatDuration(job.lastDurationSec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-sm font-medium text-zinc-500">
            Sin jobs caidos en las ultimas 24 horas.
          </div>
        )}
      </div>
    </section>
  );
}
