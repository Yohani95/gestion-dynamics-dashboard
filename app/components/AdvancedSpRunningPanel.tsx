"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { fetchWithInstance, useInstance } from "@/app/components/InstanceContext";

type RunningSp = {
  sessionId: number;
  spName: string;
  startedAt: string | null;
  elapsedSec: number;
  databaseName: string | null;
  hostName: string | null;
  programName: string | null;
  loginName: string | null;
  status: string | null;
  command: string | null;
  commandText: string | null;
};

type RunningSpResponse = {
  success: boolean;
  data: RunningSp[];
  count: number;
  error?: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--";
  return parsed.toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatDuration(seconds: number) {
  if (Number.isNaN(seconds)) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function AdvancedSpRunningPanel() {
  const { instance, instanceName } = useInstance();
  const [rows, setRows] = useState<RunningSp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minDurationSec, setMinDurationSec] = useState(0);

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);
      try {
        const params = new URLSearchParams({
          minDurationSec: String(minDurationSec),
        });

        const res = await fetchWithInstance(
          `/api/advanced/sps/running?${params.toString()}`,
          {},
          instance,
        );

        const json = (await res.json()) as RunningSpResponse;
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "No fue posible consultar SP en ejecucion.");
        }

        setRows(json.data);
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Error inesperado consultando SP.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [instance, minDurationSec],
  );

  useEffect(() => {
    void loadData("initial");
  }, [loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadData("refresh");
    }, 20_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadData]);

  const summary = useMemo(() => {
    const total = rows.length;
    const longCount = rows.filter((row) => row.elapsedSec >= 1800).length;

    return {
      total,
      longCount,
    };
  }, [rows]);

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Avanzados / SP Activos
            </p>
            <h3 className="mt-1 text-xl font-bold text-zinc-900">Procedimientos en ejecucion</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Instancia activa: <span className="font-semibold text-zinc-900">{instanceName}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="sp-min-duration" className="text-xs font-semibold text-zinc-500">
              Min seg
            </label>
            <input
              id="sp-min-duration"
              type="number"
              min={0}
              max={86400}
              value={minDurationSec}
              onChange={(event) =>
                setMinDurationSec(Math.min(Math.max(Number(event.target.value) || 0, 0), 86400))
              }
              className="w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700"
            />
            <button
              type="button"
              onClick={() => void loadData("refresh")}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sky-700 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">SP activos</p>
          <p className="mt-3 text-3xl font-black tabular-nums">{summary.total}</p>
        </article>

        <article className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-700 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">Duracion mayor a 30m</p>
          <p className="mt-3 text-3xl font-black tabular-nums">{summary.longCount}</p>
        </article>
      </div>

      <div className="rounded-3xl border border-zinc-200/70 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-zinc-500">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Cargando procedimientos...
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-rose-700">{error}</p>
            <button
              type="button"
              onClick={() => void loadData("initial")}
              className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
            >
              Reintentar
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm font-medium text-zinc-500">
            Sin procedimientos ejecutandose para el filtro actual.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">SP</th>
                  <th className="px-5 py-3 text-left font-semibold">Sesion</th>
                  <th className="px-5 py-3 text-left font-semibold">Inicio</th>
                  <th className="px-5 py-3 text-left font-semibold">Duracion</th>
                  <th className="px-5 py-3 text-left font-semibold">Base</th>
                  <th className="px-5 py-3 text-left font-semibold">Host</th>
                  <th className="px-5 py-3 text-left font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => (
                  <tr key={`${row.sessionId}-${row.spName}-${row.startedAt}`} className="hover:bg-zinc-50/80">
                    <td className="px-5 py-3 font-semibold text-zinc-900">
                      <div className="inline-flex items-center gap-2">
                        <Database className="h-4 w-4 text-indigo-500" />
                        <span>{row.spName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{row.sessionId}</td>
                    <td className="px-5 py-3 text-zinc-600">{formatDateTime(row.startedAt)}</td>
                    <td className="px-5 py-3 text-zinc-600">{formatDuration(row.elapsedSec)}</td>
                    <td className="px-5 py-3 text-zinc-600">{row.databaseName ?? "--"}</td>
                    <td className="px-5 py-3 text-zinc-600">{row.hostName ?? "--"}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                        {row.status ?? row.command ?? "--"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
