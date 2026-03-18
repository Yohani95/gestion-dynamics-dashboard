"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, MouseEvent as ReactMouseEvent, SVGProps } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Clock3,
  Copy,
  Eye,
  Loader2,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import { fetchWithInstance, useInstance } from "@/app/components/InstanceContext";
import { useAdminSession } from "@/app/components/AdminSessionContext";

type JobStatus =
  | "RUNNING"
  | "LONG_RUNNING"
  | "FAILED"
  | "SUCCEEDED"
  | "DISABLED"
  | "IDLE";
type JobAction = "START" | "STOP" | "RETRY" | "ENABLE" | "DISABLE";

type AdvancedJob = {
  name: string;
  isEnabled: boolean;
  isRunning: boolean;
  isLongRunning: boolean;
  status: JobStatus;
  startedAt: string | null;
  currentRunSec: number | null;
  lastRunAt: string | null;
  lastRunOutcome: "FAILED" | "SUCCEEDED" | "RETRY" | "CANCELED" | "UNKNOWN" | null;
  lastRunMessage: string | null;
  lastDurationSec: number | null;
  nextRunAt: string | null;
  canStart: boolean;
  canStop: boolean;
  canEnable: boolean;
  canDisable: boolean;
};

type JobsResponse = {
  success: boolean;
  data: AdvancedJob[];
  error?: string;
};

const STATUS_FILTERS: Array<{ label: string; value: string }> = [
  { label: "Todos", value: "ALL" },
  { label: "Corriendo", value: "RUNNING" },
  { label: "Largos", value: "LONG_RUNNING" },
  { label: "Fallidos", value: "FAILED" },
  { label: "Exitosos", value: "SUCCEEDED" },
  { label: "Deshabilitados", value: "DISABLED" },
  { label: "Idle", value: "IDLE" },
];

const ACTION_LABEL: Record<JobAction, string> = {
  START: "Iniciar",
  STOP: "Detener",
  RETRY: "Reintentar",
  ENABLE: "Habilitar",
  DISABLE: "Deshabilitar",
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

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--";
  return parsed.toLocaleString("es-CL", {
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

function getFailedRunMessage(message: string | null) {
  if (!message) return "Sin detalle de error en historial.";
  if (message.length <= 120) return message;
  return `${message.slice(0, 117)}...`;
}

function getFullFailedRunMessage(message: string | null) {
  if (!message) return "Sin detalle de error en historial.";
  return message;
}

function deriveStatus(job: {
  isEnabled: boolean;
  isRunning: boolean;
  isLongRunning: boolean;
  lastRunOutcome: AdvancedJob["lastRunOutcome"];
}): JobStatus {
  if (!job.isEnabled) return "DISABLED";
  if (job.isRunning && job.isLongRunning) return "LONG_RUNNING";
  if (job.isRunning) return "RUNNING";
  if (job.lastRunOutcome === "FAILED") return "FAILED";
  if (job.lastRunOutcome === "SUCCEEDED") return "SUCCEEDED";
  return "IDLE";
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Portapapeles no disponible.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("No se pudo copiar al portapapeles.");
  }
}

function StatusBadge({ status }: { status: JobStatus }) {
  const styleMap: Record<JobStatus, string> = {
    RUNNING: "bg-sky-50 text-sky-700 border-sky-100",
    LONG_RUNNING: "bg-amber-50 text-amber-700 border-amber-100",
    FAILED: "bg-rose-50 text-rose-700 border-rose-100",
    SUCCEEDED: "bg-emerald-50 text-emerald-700 border-emerald-100",
    DISABLED: "bg-zinc-200 text-zinc-700 border-zinc-300",
    IDLE: "bg-zinc-100 text-zinc-700 border-zinc-200",
  };

  const labelMap: Record<JobStatus, string> = {
    RUNNING: "Corriendo",
    LONG_RUNNING: "Largo",
    FAILED: "Fallido",
    SUCCEEDED: "Exitoso",
    DISABLED: "Deshabilitado",
    IDLE: "Idle",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styleMap[status]}`}
    >
      {labelMap[status]}
    </span>
  );
}

export default function AdvancedJobsPanel() {
  const { instance, instanceName } = useInstance();
  const { isAdmin } = useAdminSession();

  const [jobs, setJobs] = useState<AdvancedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);
  const [longRunningMin, setLongRunningMin] = useState(30);

  const [openMenu, setOpenMenu] = useState<{
    jobName: string;
    x: number;
    y: number;
  } | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const loadInFlightRef = useRef(false);

  const [confirmAction, setConfirmAction] = useState<{
    jobName: string;
    action: JobAction;
  } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [executingAction, setExecutingAction] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [errorViewer, setErrorViewer] = useState<{
    jobName: string;
    message: string;
  } | null>(null);

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
        const params = new URLSearchParams({
          limit: "500",
          page: "1",
          longRunningMin: "30",
        });
        const res = await fetchWithInstance(`/api/advanced/jobs?${params.toString()}`, {}, instance);
        const json = (await res.json()) as JobsResponse;

        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "No fue posible cargar los jobs.");
        }

        setJobs(json.data);
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Error inesperado al obtener jobs.";
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
  }, [loadData]);

  useEffect(() => {
    const runRefresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void loadData("refresh");
    };

    const intervalId = window.setInterval(() => {
      runRefresh();
    }, 30_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runRefresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadData]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    setPage(1);
  }, [instance, limit, longRunningMin, search, status]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-job-menu-trigger]")) {
        return;
      }
      if (menuPanelRef.current && menuPanelRef.current.contains(target)) {
        return;
      }
      setOpenMenu(null);
    };

    const closeMenu = () => setOpenMenu(null);

    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  const jobsWithDerivedState = useMemo(() => {
    return jobs.map((job) => {
      const isLongRunning =
        Boolean(job.isRunning) &&
        typeof job.currentRunSec === "number" &&
        job.currentRunSec >= longRunningMin * 60;

      return {
        ...job,
        isLongRunning,
        status: deriveStatus({
          isEnabled: job.isEnabled,
          isRunning: job.isRunning,
          isLongRunning,
          lastRunOutcome: job.lastRunOutcome,
        }),
      } satisfies AdvancedJob;
    });
  }, [jobs, longRunningMin]);

  const filteredJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return jobsWithDerivedState.filter((job) => {
      if (status !== "ALL" && job.status !== status) {
        return false;
      }

      if (normalizedSearch.length > 0 && !job.name.toLowerCase().includes(normalizedSearch)) {
        return false;
      }

      return true;
    });
  }, [jobsWithDerivedState, search, status]);

  const pageInfo = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filteredJobs.length / limit));
    const safePage = Math.min(page, totalPages);
    return {
      page: safePage,
      pageSize: limit,
      totalPages,
    };
  }, [filteredJobs.length, limit, page]);

  useEffect(() => {
    if (page !== pageInfo.page) {
      setPage(pageInfo.page);
    }
  }, [page, pageInfo.page]);

  const visibleJobs = useMemo(() => {
    const startIndex = (pageInfo.page - 1) * pageInfo.pageSize;
    return filteredJobs.slice(startIndex, startIndex + pageInfo.pageSize);
  }, [filteredJobs, pageInfo.page, pageInfo.pageSize]);

  const counts = useMemo(
    () => ({
      filteredCount: filteredJobs.length,
      totalCount: jobsWithDerivedState.length,
    }),
    [filteredJobs.length, jobsWithDerivedState.length],
  );

  const kpis = useMemo(
    () => ({
      running: jobsWithDerivedState.filter((job) => job.status === "RUNNING").length,
      failed24h: jobsWithDerivedState.filter((job) => job.isFailed24h).length,
      longRunning: jobsWithDerivedState.filter((job) => job.status === "LONG_RUNNING").length,
      totalJobs: jobsWithDerivedState.length,
    }),
    [jobsWithDerivedState],
  );

  const cards = useMemo(
    () => [
      {
        key: "running",
        title: "Jobs corriendo",
        value: kpis.running,
        tone: "bg-sky-50 text-sky-700 border-sky-100",
      },
      {
        key: "failed24h",
        title: "Fallidos (24h)",
        value: kpis.failed24h,
        tone: "bg-rose-50 text-rose-700 border-rose-100",
      },
      {
        key: "long",
        title: "Ejecucion larga",
        value: kpis.longRunning,
        tone: "bg-amber-50 text-amber-700 border-amber-100",
      },
      {
        key: "total",
        title: "Total jobs",
        value: kpis.totalJobs,
        tone: "bg-zinc-100 text-zinc-700 border-zinc-200",
      },
    ],
    [kpis.failed24h, kpis.longRunning, kpis.running, kpis.totalJobs],
  );

  const closeModal = () => {
    if (executingAction) return;
    setConfirmAction(null);
    setActionReason("");
  };

  const closeErrorViewer = () => {
    setErrorViewer(null);
  };

  const openConfirm = (jobName: string, action: JobAction) => {
    if (!isAdmin) return;
    setConfirmAction({ jobName, action });
    setActionReason("");
    setOpenMenu(null);
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    if (!isAdmin) {
      setFeedback({
        type: "error",
        message: "Acciones restringidas a administrador.",
      });
      return;
    }

    setExecutingAction(true);
    try {
      const response = await fetchWithInstance(
        "/api/advanced/jobs/action",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jobName: confirmAction.jobName,
            action: confirmAction.action,
            reason: actionReason || undefined,
          }),
        },
        instance,
      );

      const json = (await response.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !json.success) {
        throw new Error(json.error ?? "No fue posible ejecutar la accion.");
      }

      setFeedback({
        type: "success",
        message: json.message ?? "Accion ejecutada correctamente.",
      });
      setConfirmAction(null);
      setActionReason("");
      await loadData("refresh");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Error inesperado al ejecutar la accion.";
      setFeedback({
        type: "error",
        message,
      });
    } finally {
      setExecutingAction(false);
    }
  };

  const openErrorDetail = (job: AdvancedJob) => {
    if (job.lastRunOutcome !== "FAILED") return;
    setErrorViewer({
      jobName: job.name,
      message: getFullFailedRunMessage(job.lastRunMessage),
    });
  };

  const copyErrorMessage = async (job: AdvancedJob) => {
    if (job.lastRunOutcome !== "FAILED") return;
    try {
      const fullMessage = getFullFailedRunMessage(job.lastRunMessage);
      await copyToClipboard(fullMessage);
      setFeedback({
        type: "success",
        message: `Error copiado: ${job.name}`,
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "No fue posible copiar el error.";
      setFeedback({
        type: "error",
        message,
      });
    }
  };

  const getAvailableActions = (job: AdvancedJob) => {
    const actions: Array<{
      action: JobAction;
      label: string;
      icon: ComponentType<SVGProps<SVGSVGElement>>;
      enabled: boolean;
      hint?: string;
      tone: string;
    }> = [
      {
        action: "START",
        label: "Iniciar",
        icon: Play,
        enabled: job.canStart && job.isEnabled,
        hint: !job.isEnabled ? "Job deshabilitado" : "No autorizado por whitelist",
        tone: "text-emerald-700",
      },
      {
        action: "STOP",
        label: "Detener",
        icon: Square,
        enabled: job.canStop && job.isRunning,
        hint: !job.isRunning ? "No esta corriendo" : "No autorizado por whitelist",
        tone: "text-amber-700",
      },
      {
        action: "RETRY",
        label: "Reintentar",
        icon: RotateCcw,
        enabled: job.canStart && job.isEnabled,
        hint: !job.isEnabled ? "Job deshabilitado" : "No autorizado por whitelist",
        tone: "text-indigo-700",
      },
      {
        action: "ENABLE",
        label: "Habilitar",
        icon: ToggleRight,
        enabled: job.canEnable && !job.isEnabled,
        hint: job.isEnabled ? "Ya habilitado" : "No autorizado por whitelist",
        tone: "text-sky-700",
      },
      {
        action: "DISABLE",
        label: "Deshabilitar",
        icon: ToggleLeft,
        enabled: job.canDisable && job.isEnabled,
        hint: !job.isEnabled ? "Ya deshabilitado" : "No autorizado por whitelist",
        tone: "text-zinc-700",
      },
    ];

    return actions;
  };

  const selectedMenuJob = openMenu
    ? visibleJobs.find((job) => job.name === openMenu.jobName) ?? null
    : null;

  useEffect(() => {
    if (openMenu && !selectedMenuJob) {
      setOpenMenu(null);
    }
  }, [openMenu, selectedMenuJob]);

  const openActionsMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    jobName: string,
  ) => {
    if (!isAdmin) return;
    event.stopPropagation();

    const targetRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 212;
    const menuHeight = 220;
    const left = Math.min(
      Math.max(targetRect.right - menuWidth, 12),
      window.innerWidth - menuWidth - 12,
    );

    const preferredTop = targetRect.bottom + 6;
    const top =
      preferredTop + menuHeight > window.innerHeight - 12
        ? Math.max(12, targetRect.top - menuHeight - 6)
        : preferredTop;

    setOpenMenu((current) =>
      current?.jobName === jobName ? null : { jobName, x: left, y: top },
    );
  };

  const visibleStart =
    counts.filteredCount === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1;
  const visibleEnd =
    counts.filteredCount === 0
      ? 0
      : Math.min(pageInfo.page * pageInfo.pageSize, counts.filteredCount);

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Avanzados / Jobs
            </p>
            <h3 className="mt-1 text-xl font-bold text-zinc-900">Control de SQL Agent Jobs</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Instancia activa: <span className="font-semibold text-zinc-900">{instanceName}</span>
              {" "}| Mostrando {counts.filteredCount} de {counts.totalCount} jobs
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadData("refresh")}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Actualizar ahora
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.key} className={`rounded-2xl border p-4 shadow-sm ${card.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em]">{card.title}</p>
            <p className="mt-2 text-2xl font-black tabular-nums sm:text-3xl">{card.value}</p>
          </article>
        ))}
      </div>

      <div className="rounded-3xl border border-zinc-200/70 bg-white shadow-sm">
        {!isAdmin && (
          <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
            Acciones restringidas a administrador.
          </div>
        )}

        <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full max-w-md">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar job..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-3 text-sm text-zinc-900 outline-none ring-indigo-500/20 transition focus:ring-2"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setStatus(item.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    status === item.value
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-zinc-500" htmlFor="jobs-limit">
              Limite
            </label>
            <select
              id="jobs-limit"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700"
            >
              {[25, 50, 100, 200].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <label className="text-xs font-semibold text-zinc-500" htmlFor="jobs-threshold">
              Largo (min)
            </label>
            <input
              id="jobs-threshold"
              type="number"
              min={1}
              max={180}
              value={longRunningMin}
              onChange={(event) =>
                setLongRunningMin(Math.min(Math.max(Number(event.target.value) || 30, 1), 180))
              }
              className="w-16 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700"
            />
          </div>
        </div>

        {feedback && (
          <div
            className={`mx-5 mt-4 rounded-xl border px-4 py-2 text-sm font-medium ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {feedback.message}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-sm text-zinc-500">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Cargando jobs...
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
        ) : filteredJobs.length === 0 ? (
          <div className="p-10 text-center text-sm font-medium text-zinc-500">
            No se encontraron jobs con los filtros actuales.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-visible">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Job</th>
                    <th className="px-5 py-3 text-left font-semibold">Estado</th>
                    <th className="px-5 py-3 text-left font-semibold">Ultima ejecucion</th>
                    <th className="px-5 py-3 text-left font-semibold">Proxima ejecucion</th>
                    <th className="px-5 py-3 text-left font-semibold">Duracion</th>
                    <th className="w-[170px] px-5 py-3 text-left font-semibold">Error</th>
                    <th className="px-5 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {visibleJobs.map((job) => {
                    const failedMessage = getFailedRunMessage(job.lastRunMessage);

                    return (
                      <tr key={job.name} className="hover:bg-zinc-50/80">
                        <td className="px-5 py-3 font-semibold text-zinc-900">{job.name}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={job.status} />
                            {job.isLongRunning && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700">
                                <Clock3 className="h-3 w-3" />
                                {formatDuration(job.currentRunSec)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-zinc-600">{formatDateTime(job.lastRunAt)}</td>
                        <td className="px-5 py-3 text-zinc-600">{formatDateTime(job.nextRunAt)}</td>
                        <td className="px-5 py-3 text-zinc-600">{formatDuration(job.lastDurationSec)}</td>
                        <td className="w-[170px] px-5 py-3 text-zinc-600">
                          {job.lastRunOutcome === "FAILED" ? (
                            <div className="inline-flex items-center gap-1 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => openErrorDetail(job)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100"
                                  title="Ver detalle del error"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void copyErrorMessage(job)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100"
                                  title="Copiar error completo"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <span
                                  className="max-w-[95px] truncate text-xs font-semibold text-rose-700"
                                  title={job.lastRunMessage ?? failedMessage}
                                >
                                  Fallido
                                </span>
                            </div>
                          ) : (
                            <span className="text-zinc-400">--</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex items-center justify-end">
                            {isAdmin ? (
                              <button
                                type="button"
                                data-job-menu-trigger
                                onClick={(event) => openActionsMenu(event, job.name)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-100"
                                aria-label={`Acciones para ${job.name}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-zinc-400">Restringido</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-zinc-500">
                Mostrando {visibleStart}-{visibleEnd} de {counts.filteredCount} resultados
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pageInfo.page <= 1}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-xs font-semibold text-zinc-600">
                  Pagina {pageInfo.page} de {pageInfo.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(pageInfo.totalPages, current + 1))
                  }
                  disabled={pageInfo.page >= pageInfo.totalPages}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {errorViewer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[79] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Detalle de error
                  </p>
                  <h4 className="mt-1 truncate text-base font-bold text-zinc-900 sm:text-lg">
                    {errorViewer.jobName}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={closeErrorViewer}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
                  aria-label="Cerrar detalle de error"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <textarea
                readOnly
                value={errorViewer.message}
                rows={10}
                className="mt-4 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none"
              />

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeErrorViewer}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void (async () => {
                      try {
                        await copyToClipboard(errorViewer.message);
                        setFeedback({
                          type: "success",
                          message: `Error copiado: ${errorViewer.jobName}`,
                        });
                      } catch (requestError) {
                        const message =
                          requestError instanceof Error
                            ? requestError.message
                            : "No fue posible copiar el error.";
                        setFeedback({
                          type: "error",
                          message,
                        });
                      }
                    })()
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  <Copy className="h-4 w-4" />
                  Copiar error completo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAdmin && openMenu && selectedMenuJob && (
          <motion.div
            ref={menuPanelRef}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            style={{ top: openMenu.y, left: openMenu.x }}
            className="fixed z-[75] w-[212px] rounded-xl border border-zinc-200 bg-white p-1 shadow-2xl"
          >
            {getAvailableActions(selectedMenuJob).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.action}
                  type="button"
                  onClick={() => openConfirm(selectedMenuJob.name, item.action)}
                  disabled={!item.enabled}
                  title={item.enabled ? item.label : item.hint}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                    item.enabled
                      ? `${item.tone} hover:bg-zinc-100`
                      : "cursor-not-allowed text-zinc-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Confirmacion
                  </p>
                  <h4 className="mt-1 text-lg font-bold text-zinc-900">
                    {ACTION_LABEL[confirmAction.action]} job
                  </h4>
                  <p className="mt-1 text-sm text-zinc-600">
                    Job: <span className="font-semibold text-zinc-900">{confirmAction.jobName}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  disabled={executingAction}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="inline-flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Esta accion impacta procesos de integracion en tiempo real.
                </p>
              </div>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Motivo (opcional)
              </label>
              <textarea
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                rows={3}
                placeholder="Ej: habilitacion temporal para ventana de reproceso"
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-indigo-500/20 transition focus:ring-2"
              />

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={executingAction}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void executeAction()}
                  disabled={executingAction}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {executingAction ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ejecutando...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Confirmar accion
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
