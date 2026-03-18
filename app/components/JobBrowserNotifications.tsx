"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bell, BellOff } from "lucide-react";
import { fetchWithInstance, useInstance } from "./InstanceContext";
import { useAdminSession } from "./AdminSessionContext";

type AlertsSummary = {
  success?: boolean;
  failedJobs24h?: number;
  longRunningJobs?: number;
  totalRunningJobs?: number;
  failedJobsSample?: string[];
  longRunningJobsSample?: string[];
  failedToken?: string;
  longToken?: string;
};

const SETTINGS_KEY = "jobs-browser-notifications-enabled";
const SETTINGS_EVENT = "jobs-browser-notifications-changed";
const settingsListeners = new Set<() => void>();
const clientSnapshotListeners = new Set<() => void>();

function getStoredEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SETTINGS_KEY) === "1";
  } catch {
    return false;
  }
}

function setStoredEnabled(value: boolean) {
  try {
    localStorage.setItem(SETTINGS_KEY, value ? "1" : "0");
  } catch {
    // noop
  }
}

function notifySettingsChanged() {
  settingsListeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  }
}

function subscribeSettings(listener: () => void) {
  settingsListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      settingsListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY) {
      listener();
    }
  };

  const handleCustomEvent = () => {
    listener();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(SETTINGS_EVENT, handleCustomEvent);

  return () => {
    settingsListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SETTINGS_EVENT, handleCustomEvent);
  };
}

function subscribeClientSnapshot(listener: () => void) {
  clientSnapshotListeners.add(listener);
  return () => {
    clientSnapshotListeners.delete(listener);
  };
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function formatPollTime(value: string | null) {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--";
  return parsed.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sanitizeTag(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
}

export default function JobBrowserNotifications() {
  const { instance, instanceName } = useInstance();
  const { isAdmin } = useAdminSession();
  const [, setPermissionVersion] = useState(0);
  const [pollStatus, setPollStatus] = useState<"idle" | "ok" | "error">("idle");
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  const pollInFlightRef = useRef(false);
  const previousByInstanceRef = useRef<
    Partial<
      Record<
      string,
      {
        failedJobs24h: number;
        longRunningJobs: number;
        totalRunningJobs: number;
        failedToken: string;
        longToken: string;
      }
      >
    >
  >({});

  const isClient = useSyncExternalStore(
    subscribeClientSnapshot,
    getClientSnapshot,
    getServerSnapshot,
  );
  const supported = isClient && "Notification" in window;
  const isDev = process.env.NODE_ENV !== "production";
  const enabled = useSyncExternalStore(subscribeSettings, getStoredEnabled, () => false);
  const permission: NotificationPermission = supported ? Notification.permission : "default";

  const showNotification = useCallback(
    (title: string, body: string, tag: string) => {
      if (!supported || Notification.permission !== "granted") return;
      try {
        const n = new Notification(title, { body, tag });
        n.onclick = () => {
          window.focus();
          window.location.assign("/advanced/jobs");
        };
      } catch {
        // noop
      }
    },
    [supported],
  );

  useEffect(() => {
    if (!enabled || !supported || permission !== "granted") return;

    let active = true;

    const poll = async () => {
      if (!active) return;
      if (document.visibilityState !== "visible") return;
      if (pollInFlightRef.current) return;

      pollInFlightRef.current = true;
      try {
        const response = await fetchWithInstance(
          "/api/advanced/alerts/summary",
          {},
          instance,
        );
        const data = (await response.json()) as AlertsSummary;
        if (!response.ok || !data.success || !active) {
          setPollStatus("error");
          setLastPollAt(new Date().toISOString());
          return;
        }

        const current = {
          failedJobs24h: Number(data.failedJobs24h ?? 0),
          longRunningJobs: Number(data.longRunningJobs ?? 0),
          totalRunningJobs: Number(data.totalRunningJobs ?? 0),
          failedToken:
            typeof data.failedToken === "string"
              ? data.failedToken
              : `${Number(data.failedJobs24h ?? 0)}:`,
          longToken:
            typeof data.longToken === "string"
              ? data.longToken
              : `${Number(data.longRunningJobs ?? 0)}:`,
        };
        const failedSample = (data.failedJobsSample ?? []).slice(0, 2);
        const longSample = (data.longRunningJobsSample ?? []).slice(0, 2);

        const previous = previousByInstanceRef.current[instance];
        if (!previous) {
          if (current.failedJobs24h > 0 || current.longRunningJobs > 0) {
            showNotification(
              `Estado inicial de alertas (${instanceName})`,
              `Fallidos: ${current.failedJobs24h} | Largos: ${current.longRunningJobs}. Revisa Avanzados > Jobs.`,
              `jobs-initial-${instance}`,
            );
          }
        } else {
          if (current.failedJobs24h > 0 && current.failedToken !== previous.failedToken) {
            const failedSampleText =
              failedSample.length > 0 ? ` Ejemplo: ${failedSample.join(", ")}.` : "";
            showNotification(
              `Jobs fallidos detectados (${instanceName})`,
              `Fallidos 24h: ${current.failedJobs24h}.${failedSampleText}`,
              `jobs-failed-${instance}-${sanitizeTag(current.failedToken)}`,
            );
          }

          if (current.longRunningJobs > 0 && current.longToken !== previous.longToken) {
            const longSampleText =
              longSample.length > 0 ? ` Ejemplo: ${longSample.join(", ")}.` : "";
            showNotification(
              `Jobs largos detectados (${instanceName})`,
              `Ejecucion larga: ${current.longRunningJobs}.${longSampleText}`,
              `jobs-long-${instance}-${sanitizeTag(current.longToken)}`,
            );
          }
        }

        previousByInstanceRef.current[instance] = current;
        setPollStatus("ok");
        setLastPollAt(new Date().toISOString());
      } catch {
        if (active) {
          setPollStatus("error");
          setLastPollAt(new Date().toISOString());
        }
      } finally {
        pollInFlightRef.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 30_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, instance, instanceName, permission, showNotification, supported]);

  const buttonLabel = useMemo(() => {
    if (!enabled) return "Alertas off";
    if (!supported) return "Sin soporte";
    if (permission !== "granted") return "Permiso pendiente";
    return "Alertas on";
  }, [enabled, permission, supported]);

  const permissionLabel = useMemo(() => {
    if (!supported) return "Sin soporte";
    if (permission === "granted") return "Concedido";
    if (permission === "denied") return "Denegado";
    return "Pendiente";
  }, [permission, supported]);

  const pollLabel = useMemo(() => {
    if (!enabled) return "Inactivo";
    if (pollStatus === "idle") return "Esperando";
    if (pollStatus === "error") return `Error (${formatPollTime(lastPollAt)})`;
    return `OK (${formatPollTime(lastPollAt)})`;
  }, [enabled, lastPollAt, pollStatus]);

  const onToggle = async () => {
    if (!supported) return;

    if (enabled) {
      setStoredEnabled(false);
      notifySettingsChanged();
      setPollStatus("idle");
      setLastPollAt(null);
      return;
    }

    if (Notification.permission !== "granted") {
      await Notification.requestPermission();
      setPermissionVersion((version) => version + 1);
    }

    if (Notification.permission === "granted") {
      setStoredEnabled(true);
      notifySettingsChanged();
      delete previousByInstanceRef.current[instance];
      return;
    }

    setStoredEnabled(false);
    notifySettingsChanged();
    setPollStatus("idle");
    setLastPollAt(null);
  };

  const onTestNotification = async () => {
    if (!supported) return;

    if (Notification.permission !== "granted") {
      await Notification.requestPermission();
      setPermissionVersion((version) => version + 1);
    }

    if (Notification.permission !== "granted") return;

    showNotification(
      `Prueba de alerta (${instanceName})`,
      "Notificacion de prueba de Jobs en navegador.",
      `jobs-test-${instance}`,
    );
  };

  const canShowTestButton = isDev || isAdmin;

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        title="Activar alertas de Jobs en navegador"
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
          enabled && permission === "granted"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
        }`}
      >
        {enabled && permission === "granted" ? (
          <Bell className="h-4 w-4" />
        ) : (
          <BellOff className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{buttonLabel}</span>
      </button>

      {canShowTestButton && (
        <button
          type="button"
          onClick={onTestNotification}
          title="Probar notificacion del navegador"
          className="inline-flex items-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
        >
          Probar alerta
        </button>
      )}

      <span className="hidden xl:inline text-[11px] font-medium text-zinc-500">
        Permiso: {permissionLabel} | Poll: {pollLabel}
      </span>
    </div>
  );
}
