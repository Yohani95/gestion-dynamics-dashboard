"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  HelpCircle,
  Play,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { formatDateLocal } from "@/lib/formatUtils";
import { useInstance, fetchWithInstance } from "./InstanceContext";
import { useAdminSession } from "./AdminSessionContext";

interface EstadoTraspaso {
  Id_EstadoEnvioTraspasos: string;
  Traspaso: string;
  Tipo: string;
  Estado: string;
  Fecha: string;
}

export default function PanelEstadosTransferencias() {
  const { instance } = useInstance();
  const { isAdmin } = useAdminSession();

  const [data, setData] = useState<EstadoTraspaso[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("TODOS");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        estado: filterEstado,
        search: searchTerm,
        limit: "50",
      });

      const res = await fetchWithInstance(
        `/api/transferencias/estados?${params.toString()}`,
        {},
        instance,
      );
      const json = await res.json();

      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error);
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }, [filterEstado, instance, searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData();
    }, 500);

    return () => clearTimeout(timer);
  }, [fetchData]);

  const ejecutarAccion = async (id: string, accion: "REINTENTAR" | "TERMINAR") => {
    if (!isAdmin) return;

    setUpdatingId(id);
    try {
      const res = await fetchWithInstance(
        "/api/transferencias/estados/accion",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, accion }),
        },
        instance,
      );
      const json = await res.json();

      if (json.success) {
        setConfirmCloseId(null);
        void fetchData();
      } else {
        alert(json.error);
      }
    } catch {
      alert("Error al ejecutar accion");
    } finally {
      setUpdatingId(null);
    }
  };

  const getEstadoBadge = (estado: string) => {
    const config: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
      PENDIENTE: { bg: "bg-zinc-100", text: "text-zinc-700", icon: Clock },
      ENVIANDO: { bg: "bg-blue-50", text: "text-blue-700", icon: Send },
      ERROR: { bg: "bg-red-50", text: "text-red-700", icon: AlertCircle },
      OK: { bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2 },
      TERMINADO: { bg: "bg-indigo-50", text: "text-indigo-700", icon: Check },
    };

    const style = config[estado] ?? {
      bg: "bg-zinc-50",
      text: "text-zinc-500",
      icon: HelpCircle,
    };
    const Icon = style.icon;

    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full ${style.bg} ${style.text} border border-zinc-200/50 px-2.5 py-1 text-xs font-semibold`}
      >
        <Icon className="h-3.5 w-3.5" />
        {estado}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3">
          <div className="hidden rounded-2xl border border-indigo-100 bg-indigo-50 p-2.5 text-indigo-600 shadow-sm sm:block">
            <RefreshCw className="h-6 w-6" />
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
              Control de Estados de Envio
              {data.length > 0 && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-black text-white ring-2 ring-white shadow-sm">
                  {data.length}
                </span>
              )}
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Busque y gestione manualmente el ciclo de vida de cada traspaso.
            </p>
            {!isAdmin && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Acciones restringidas a administrador.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por N de Traspaso..."
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-10 pr-4 text-sm text-zinc-900 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
          <Filter className="mr-1 h-4 w-4 shrink-0 text-zinc-400" />
          {["TODOS", "ERROR", "PENDIENTE", "ENVIANDO", "OK", "TERMINADO"].map((estado) => (
            <button
              key={estado}
              onClick={() => setFilterEstado(estado)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filterEstado === estado
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:bg-zinc-200/50 hover:text-zinc-900"
              }`}
            >
              {estado}
            </button>
          ))}
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition-all hover:text-zinc-900"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 font-medium text-zinc-600">
              <tr>
                <th className="px-6 py-4">N Traspaso</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              <AnimatePresence mode="popLayout">
                {data.map((item) => (
                  <motion.tr
                    key={item.Id_EstadoEnvioTraspasos}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="transition-colors hover:bg-zinc-50/50"
                  >
                    <td className="px-6 py-4 font-medium text-zinc-900">{item.Traspaso}</td>
                    <td className="px-6 py-4 text-zinc-600">
                      {item.Tipo === "D" ? "Despacho" : "Recepcion"}
                    </td>
                    <td className="px-6 py-4">{getEstadoBadge(item.Estado)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-zinc-500">
                      {formatDateLocal(item.Fecha)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isAdmin ? (
                        <div className="flex items-center justify-end gap-2">
                          {item.Estado === "ERROR" && (
                            <button
                              onClick={() =>
                                void ejecutarAccion(item.Id_EstadoEnvioTraspasos, "REINTENTAR")
                              }
                              disabled={updatingId === item.Id_EstadoEnvioTraspasos}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                            >
                              <Play className="h-3.5 w-3.5" />
                              Reintentar
                            </button>
                          )}

                          {item.Estado !== "TERMINADO" &&
                            (confirmCloseId === item.Id_EstadoEnvioTraspasos ? (
                              <div className="flex items-center gap-1 rounded-lg border border-amber-100 bg-amber-50 p-1">
                                <span className="whitespace-nowrap px-1 text-[10px] font-bold text-amber-700">
                                  Cerrar?
                                </span>
                                <button
                                  onClick={() =>
                                    void ejecutarAccion(item.Id_EstadoEnvioTraspasos, "TERMINAR")
                                  }
                                  className="rounded-md bg-amber-500 p-1.5 text-white transition-colors hover:bg-amber-600"
                                  title="Confirmar"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => setConfirmCloseId(null)}
                                  className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-400 transition-colors hover:text-zinc-600"
                                  title="Cancelar"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmCloseId(item.Id_EstadoEnvioTraspasos)}
                                disabled={updatingId === item.Id_EstadoEnvioTraspasos}
                                className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Cerrar
                              </button>
                            ))}
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-zinc-400">Restringido</span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>

          {data.length === 0 && !loading && (
            <div className="py-20 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                <Search className="h-6 w-6 text-zinc-400" />
              </div>
              <p className="text-zinc-500">
                No se encontraron transferencias con los filtros actuales.
              </p>
            </div>
          )}

          {loading && data.length === 0 && (
            <div className="py-20 text-center">
              <RefreshCw className="mx-auto h-8 w-8 animate-spin text-zinc-200" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
