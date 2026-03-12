"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type InstanceId = "default" | "andpac";

interface InstanceContextType {
    instance: InstanceId;
    setInstance: (id: InstanceId) => void;
    instanceName: string;
}

const InstanceContext = createContext<InstanceContextType | undefined>(undefined);

const STORAGE_KEY = "view-instance-id";

export function InstanceProvider({ children }: { children: ReactNode }) {
    const [instance, setInstanceState] = useState<InstanceId>("default");

    useEffect(() => {
        const saved = sessionStorage.getItem(STORAGE_KEY) as InstanceId;
        if (saved === "default" || saved === "andpac") {
            setInstanceState(saved);
        }
    }, []);

    const setInstance = (id: InstanceId) => {
        setInstanceState(id);
        sessionStorage.setItem(STORAGE_KEY, id);
        // Recargar para limpiar estados de componentes que dependen de la instancia (como listas de empresas)
        window.location.reload();
    };

    const instanceName = instance === "andpac" ? "AndPac" : "TL Group";

    return (
        <InstanceContext.Provider value={{ instance, setInstance, instanceName }}>
            {children}
        </InstanceContext.Provider>
    );
}

export function useInstance() {
    const context = useContext(InstanceContext);
    if (!context) {
        throw new Error("useInstance debe usarse dentro de un InstanceProvider");
    }
    return context;
}

/**
 * Wrapper de fetch que inyecta automáticamente la cabecera de instancia
 */
export async function fetchWithInstance(url: string, options: RequestInit = {}, instanceId: InstanceId) {
    const headers = new Headers(options.headers);
    headers.set("x-instance", instanceId);

    return fetch(url, {
        ...options,
        headers
    });
}
