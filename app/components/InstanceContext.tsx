"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_INSTANCE_ID,
  getInstanceMeta,
  resolveInstanceId,
  type InstanceId,
  type InstanceScope,
} from "@/lib/instances";

interface InstanceContextType {
  instance: InstanceId;
  setInstance: (id: InstanceId) => void;
  instanceName: string;
  instanceDescription: string;
  instanceScope: InstanceScope;
  isJobsOnly: boolean;
  supportsTransferencias: boolean;
}

const InstanceContext = createContext<InstanceContextType | undefined>(undefined);

const STORAGE_KEY = "view-instance-id";
const instanceListeners = new Set<() => void>();

function getSnapshot(): InstanceId {
  if (typeof window === "undefined") return DEFAULT_INSTANCE_ID;
  return resolveInstanceId(sessionStorage.getItem(STORAGE_KEY));
}

function subscribe(listener: () => void) {
  instanceListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      instanceListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    instanceListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function notifyInstanceChange() {
  instanceListeners.forEach((listener) => listener());
}

export function InstanceProvider({ children }: { children: ReactNode }) {
  const instance = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_INSTANCE_ID);

  useEffect(() => {
    const meta = getInstanceMeta(instance);
    const currentPath = window.location.pathname;

    if (meta.scope === "jobs_only" && !currentPath.startsWith("/advanced/jobs")) {
      window.location.replace("/advanced/jobs");
      return;
    }

    if (!meta.supportsTransferencias && currentPath.startsWith("/transferencias")) {
      window.location.replace("/");
    }
  }, [instance]);

  const setInstance = useCallback((id: InstanceId) => {
    const safeInstance = resolveInstanceId(id);
    sessionStorage.setItem(STORAGE_KEY, safeInstance);
    notifyInstanceChange();

    const meta = getInstanceMeta(safeInstance);
    const currentPath = window.location.pathname;

    if (meta.scope === "jobs_only" && !currentPath.startsWith("/advanced/jobs")) {
      window.location.assign("/advanced/jobs");
      return;
    }

    if (!meta.supportsTransferencias && currentPath.startsWith("/transferencias")) {
      window.location.assign("/");
      return;
    }

    // Recarga para limpiar estados de componentes que dependen de la instancia.
    window.location.reload();
  }, []);

  const meta = getInstanceMeta(instance);
  const value: InstanceContextType = {
    instance,
    setInstance,
    instanceName: meta.name,
    instanceDescription: meta.desc,
    instanceScope: meta.scope,
    isJobsOnly: meta.scope === "jobs_only",
    supportsTransferencias: meta.supportsTransferencias,
  };

  return <InstanceContext.Provider value={value}>{children}</InstanceContext.Provider>;
}

export function useInstance() {
  const context = useContext(InstanceContext);
  if (!context) {
    throw new Error("useInstance debe usarse dentro de un InstanceProvider");
  }
  return context;
}

/**
 * Wrapper de fetch que inyecta automaticamente la cabecera de instancia.
 */
export async function fetchWithInstance(url: string, options: RequestInit = {}, instanceId: InstanceId) {
  const headers = new Headers(options.headers);
  headers.set("x-instance", instanceId);

  return fetch(url, {
    ...options,
    headers,
  });
}

export type { InstanceId };
