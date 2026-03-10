"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, RefreshCw, CheckCircle2, AlertCircle, Clock, Send, Play, Check, X, Filter, HelpCircle, AlertTriangle } from "lucide-react";

interface EstadoTraspaso {
    Id_EstadoEnvioTraspasos: string;
    Traspaso: string;
    Tipo: string;
    Estado: string;
    Fecha: string;
}

export default function PanelEstadosTransferencias() {
    const [data, setData] = useState<EstadoTraspaso[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterEstado, setFilterEstado] = useState("TODOS");
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                estado: filterEstado,
                search: searchTerm,
                limit: "50"
            });
            const res = await fetch(`/api/transferencias/estados?${params.toString()}`);
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            } else {
                setError(json.error);
            }
        } catch (err) {
            setError("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, filterEstado]);

    const ejecutarAccion = async (id: string, accion: "REINTENTAR" | "TERMINAR") => {
        setUpdatingId(id);
        try {
            const res = await fetch("/api/transferencias/estados/accion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, accion })
            });
            const json = await res.json();
            if (json.success) {
                setConfirmCloseId(null);
                fetchData();
            } else {
                alert(json.error);
            }
        } catch (err) {
            alert("Error al ejecutar acción");
        } finally {
            setUpdatingId(null);
        }
    };

    const getEstadoBadge = (estado: string) => {
        const config: Record<string, { bg: string, text: string, icon: any }> = {
            "PENDIENTE": { bg: "bg-zinc-100", text: "text-zinc-700", icon: Clock },
            "ENVIANDO": { bg: "bg-blue-50", text: "text-blue-700", icon: Send },
            "ERROR": { bg: "bg-red-50", text: "text-red-700", icon: AlertCircle },
            "OK": { bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2 },
            "TERMINADO": { bg: "bg-indigo-50", text: "text-indigo-700", icon: Check },
        };

        const style = config[estado] || { bg: "bg-zinc-50", text: "text-zinc-500", icon: HelpCircle };
        const Icon = style.icon;

        return (
            <span className={`inline-flex items-center gap-1.5 rounded-full ${style.bg} ${style.text} px-2.5 py-1 text-xs font-semibold border border-zinc-200/50`}>
                <Icon className="w-3.5 h-3.5" />
                {estado}
            </span>
        );
    };

    return (
        <div className="flex flex-col gap-6 p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                        type="text"
                        placeholder="Buscar por N° de Traspaso..."
                        className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                    <Filter className="w-4 h-4 text-zinc-400 mr-1 shrink-0" />
                    {["TODOS", "ERROR", "PENDIENTE", "ENVIANDO", "OK", "TERMINADO"].map((est) => (
                        <button
                            key={est}
                            onClick={() => setFilterEstado(est)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${filterEstado === est
                                ? "bg-zinc-900 text-white shadow-sm"
                                : "bg-white text-zinc-500 hover:text-zinc-900 border border-zinc-200 shadow-sm"
                                }`}
                        >
                            {est}
                        </button>
                    ))}
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-500 hover:text-zinc-900 shadow-sm transition-all"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-medium">
                            <tr>
                                <th className="px-6 py-4">N° Traspaso</th>
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
                                        className="hover:bg-zinc-50/50 transition-colors"
                                    >
                                        <td className="px-6 py-4 font-medium text-zinc-900">{item.Traspaso}</td>
                                        <td className="px-6 py-4 text-zinc-600">
                                            {item.Tipo === 'D' ? 'Despacho' : 'Recepción'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getEstadoBadge(item.Estado)}
                                        </td>
                                        <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">
                                            {new Date(item.Fecha).toLocaleString("es-CL", { dateStyle: 'short', timeStyle: 'short' })}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {item.Estado === 'ERROR' && (
                                                    <button
                                                        onClick={() => ejecutarAccion(item.Id_EstadoEnvioTraspasos, "REINTENTAR")}
                                                        disabled={updatingId === item.Id_EstadoEnvioTraspasos}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                                                    >
                                                        <Play className="w-3.5 h-3.5" />
                                                        Reintentar
                                                    </button>
                                                )}
                                                {item.Estado !== 'TERMINADO' && (
                                                    confirmCloseId === item.Id_EstadoEnvioTraspasos ? (
                                                        <div className="flex items-center gap-1 bg-amber-50 rounded-lg p-1 border border-amber-100">
                                                            <span className="text-[10px] font-bold text-amber-700 px-1 whitespace-nowrap">¿Cerrar?</span>
                                                            <button
                                                                onClick={() => ejecutarAccion(item.Id_EstadoEnvioTraspasos, "TERMINAR")}
                                                                className="p-1.5 bg-amber-500 text-white hover:bg-amber-600 rounded-md transition-colors"
                                                                title="Confirmar"
                                                            >
                                                                <Check className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmCloseId(null)}
                                                                className="p-1.5 bg-white text-zinc-400 hover:text-zinc-600 rounded-md border border-zinc-200 transition-colors"
                                                                title="Cancelar"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirmCloseId(item.Id_EstadoEnvioTraspasos)}
                                                            disabled={updatingId === item.Id_EstadoEnvioTraspasos}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                            Cerrar
                                                        </button>
                                                    )
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>

                    {data.length === 0 && !loading && (
                        <div className="py-20 text-center">
                            <div className="mx-auto w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mb-3">
                                <Search className="w-6 h-6 text-zinc-400" />
                            </div>
                            <p className="text-zinc-500">No se encontraron transferencias con los filtros actuales.</p>
                        </div>
                    )}

                    {loading && data.length === 0 && (
                        <div className="py-20 text-center">
                            <RefreshCw className="w-8 h-8 animate-spin text-zinc-200 mx-auto" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
