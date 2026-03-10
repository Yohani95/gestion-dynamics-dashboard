"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronDown, ChevronRight, Clock, RefreshCw, XCircle, AlertCircle, FileJson, Copy, Check } from "lucide-react";

interface LogEntry {
    Traspaso: string;
    Fecha_Carga: string;
    Resultado: string;
    Atributos: string;
    Tipo_Carga: string;
}

export default function HistorialLogs() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [limit, setLimit] = useState(20);
    const [error, setError] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const fetchLogs = async (fetchLimit: number) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/transferencias/logs?limite=${fetchLimit}`);
            const json = await res.json();
            if (json.success) {
                setLogs(json.data);
            } else {
                setError(json.error || "Error al cargar los logs.");
            }
        } catch (err) {
            setError("Fallo de conexión al cargar el historial.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs(limit);
    }, [limit]);

    const toggleRow = (id: string, index: number) => {
        const key = `${id}-${index}`;
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(key)) {
            newExpanded.delete(key);
        } else {
            newExpanded.add(key);
        }
        setExpandedRows(newExpanded);
    };

    const getStatusIcon = (resultado: string, atributos: string) => {
        if (resultado === "OK") {
            return (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs font-medium border border-emerald-100/50">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Éxito
                </span>
            );
        }

        if (atributos.includes("is not in inventory")) {
            return (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 px-2.5 py-1 text-xs font-medium border border-red-100/50">
                    <XCircle className="w-3.5 h-3.5" />
                    Falta Stock
                </span>
            );
        }

        if (atributos.includes("save your changes right now")) {
            return (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-xs font-medium border border-amber-100/50">
                    <Clock className="w-3.5 h-3.5" />
                    Bloqueo Temp
                </span>
            );
        }

        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 text-rose-700 px-2.5 py-1 text-xs font-medium border border-rose-100/50">
                <AlertCircle className="w-3.5 h-3.5" />
                Error
            </span>
        );
    };

    const parseJsonSafe = (str: string) => {
        try {
            return JSON.stringify(JSON.parse(str), null, 2);
        } catch {
            return str;
        }
    };

    const copyToClipboard = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2000);
        } catch (err) {
            console.error("Error al copiar:", err);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-zinc-200/50 overflow-hidden">
            <div className="p-6 md:p-8 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-zinc-900">Historial General de Traspasos</h3>
                    <p className="text-sm text-zinc-500 mt-1">Explorador en tiempo real de los logs de Business Central.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-zinc-100 p-1 rounded-lg">
                        {[10, 20, 50, 100].map((num) => (
                            <button
                                key={num}
                                onClick={() => setLimit(num)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${limit === num
                                    ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                                    : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                                    }`}
                            >
                                Top {num}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => fetchLogs(limit)}
                        disabled={loading}
                        className="p-2 rounded-lg bg-zinc-50 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            {error ? (
                <div className="p-8 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-4">
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-medium text-red-800">{error}</h3>
                </div>
            ) : (
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-medium whitespace-nowrap">
                            <tr>
                                <th className="px-5 py-3.5 pl-6 w-10"></th>
                                <th className="px-5 py-3.5">Nº Traspaso</th>
                                <th className="px-5 py-3.5">Fecha Carga</th>
                                <th className="px-5 py-3.5">Estado BC</th>
                                <th className="px-5 py-3.5">Tipo Carga</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 relative">
                            {loading && logs.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-20 text-center">
                                        <RefreshCw className="w-6 h-6 animate-spin text-zinc-400 mx-auto" />
                                    </td>
                                </tr>
                            )}

                            <AnimatePresence>
                                {logs.map((log, index) => {
                                    const key = `${log.Traspaso}-${index}`;
                                    const isExpanded = expandedRows.has(key);
                                    const dateObj = new Date(log.Fecha_Carga);

                                    return (
                                        <React.Fragment key={key}>
                                            <motion.tr
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className={`transition-colors cursor-pointer ${isExpanded ? "bg-zinc-50/80" : "hover:bg-zinc-50/50"
                                                    }`}
                                                onClick={() => toggleRow(log.Traspaso, index)}
                                            >
                                                <td className="px-5 py-4 pl-6 text-zinc-400">
                                                    <motion.div
                                                        animate={{ rotate: isExpanded ? 90 : 0 }}
                                                        transition={{ duration: 0.2 }}
                                                    >
                                                        <ChevronRight className="w-4 h-4" />
                                                    </motion.div>
                                                </td>
                                                <td className="px-5 py-4 font-medium text-zinc-900">{log.Traspaso}</td>
                                                <td className="px-5 py-4 text-zinc-500 whitespace-nowrap">
                                                    {dateObj.toLocaleString("es-CL", {
                                                        dateStyle: "short",
                                                        timeStyle: "short"
                                                    })}
                                                </td>
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    {getStatusIcon(log.Resultado, log.Atributos)}
                                                </td>
                                                <td className="px-5 py-4 text-zinc-600">{log.Tipo_Carga}</td>
                                            </motion.tr>

                                            {isExpanded && (
                                                <motion.tr
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="bg-zinc-50/50"
                                                >
                                                    <td colSpan={5} className="px-5 py-4 pl-14">
                                                        <div className="bg-zinc-900 rounded-lg border border-zinc-800 shadow-inner overflow-hidden">
                                                            <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-b border-zinc-800/50">
                                                                <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                                                                    <FileJson className="w-3.5 h-3.5" />
                                                                    Payload / Error Detail
                                                                </div>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        copyToClipboard(log.Atributos, key);
                                                                    }}
                                                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-all text-[10px] font-medium border border-zinc-600/30"
                                                                >
                                                                    {copiedKey === key ? (
                                                                        <>
                                                                            <Check className="w-3 h-3 text-emerald-400" />
                                                                            Copiado
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Copy className="w-3 h-3" />
                                                                            Copiar
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>
                                                            <div className="p-4 max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                                                                <pre className="text-zinc-300 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                                                                    {parseJsonSafe(log.Atributos)}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
