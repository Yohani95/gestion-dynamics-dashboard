"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertCircle,
    Clock,
    RefreshCw,
    XCircle,
    ChevronRight,
    FileJson,
    CheckCircle2,
    Copy,
    Check,
    ArrowRightLeft,
    Search,
    AlertTriangle
} from "lucide-react";
import { formatDateLocal } from "@/lib/formatUtils";
import { useInstance, fetchWithInstance } from "./InstanceContext";

interface RecienteError {
    Traspaso: string;
    Tipo: string;
    Estado_SAT: string;
    Fecha_Ultimo_Intento: string;
    Fecha_Error_BC: string;
    Accion_BC: string;
    Motivo_Principal: string;
    Atributos: string;
    Is_Fake_OK: number;
}

export default function ErroresRecientes() {
    const { instance } = useInstance();
    const [data, setData] = useState<RecienteError[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithInstance("/api/transferencias/errores-recientes", {}, instance);
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            } else {
                setError(json.error || "Error al cargar fallos recientes.");
            }
        } catch (err) {
            setError("Error de conexión al servidor.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [instance]);

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

    const copyToClipboard = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2000);
        } catch (err) {
            console.error("Error al copiar:", err);
        }
    };

    const parseJsonSafe = (str: string) => {
        try {
            return JSON.stringify(JSON.parse(str), null, 2);
        } catch {
            return str;
        }
    };

    const filteredData = data.filter(item =>
        item.Traspaso.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.Motivo_Principal.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 md:p-8"
        >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-4">
                <div className="flex items-center gap-4">
                    <div className="bg-red-50 text-red-600 p-2.5 rounded-2xl border border-red-100 shadow-sm hidden sm:block">
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                            Historial de Fallos Recuperables
                            {filteredData.length > 0 && (
                                <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm ring-2 ring-white">
                                    {filteredData.length}
                                </span>
                            )}
                        </h3>
                        <p className="text-sm text-zinc-500 mt-1">Errores de integración de los últimos 3 días en proceso de auto-recuperación.</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Buscar traspaso..."
                            className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-[10px] font-bold text-indigo-700 border border-indigo-100 shadow-sm whitespace-nowrap">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                            </span>
                            Auto-Recuperación Activa
                        </span>
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="p-2 border border-zinc-200 rounded-xl bg-white text-zinc-600 hover:text-zinc-900 shadow-sm transition-all"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 mb-8 flex items-start gap-4 shadow-sm">
                <div className="bg-emerald-500 text-white p-2 rounded-xl shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="font-bold text-emerald-900 text-sm">El Job de Auto-Recuperación está operando</h4>
                    <p className="text-emerald-800/80 text-sm mt-1 leading-relaxed">
                        Los traspasos que fallaron por <b>falta de inventario</b> o <b>bloqueos temporales</b> serán intentados nuevamente cada hora. Si ya se procesaron en BC, aparecerán aquí hasta que se actualice el estado o los cierres manual.
                    </p>
                </div>
            </div>

            {error ? (
                <div className="bg-red-50 border border-red-100 p-6 rounded-2xl text-center">
                    <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                    <p className="text-red-800 text-sm font-medium">{error}</p>
                    <button
                        onClick={fetchData}
                        className="mt-4 text-xs font-bold text-red-600 border-b border-red-200 pb-0.5 hover:border-red-400"
                    >
                        Intentar de nuevo
                    </button>
                </div>
            ) : (
                <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-sm ring-1 ring-zinc-200/50">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold tracking-tight uppercase text-[10px]">
                                <tr>
                                    <th className="px-6 py-4 w-10"></th>
                                    <th className="px-6 py-4">Nº Traspaso</th>
                                    <th className="px-6 py-4">Estado SAT</th>
                                    <th className="px-6 py-4">Acción BC</th>
                                    <th className="px-6 py-4">Motivo Principal</th>
                                    <th className="px-6 py-4 hidden lg:table-cell">Último Fallo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 relative">
                                {loading && data.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="py-20 text-center">
                                            <RefreshCw className="w-8 h-8 animate-spin text-zinc-300 mx-auto" />
                                        </td>
                                    </tr>
                                )}

                                {!loading && filteredData.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="py-20 text-center">
                                            <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                {searchTerm ? <Search className="w-6 h-6 text-zinc-300" /> : <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
                                            </div>
                                            <p className="text-zinc-500 font-medium">
                                                {searchTerm ? "No se encontraron resultados para tu búsqueda." : "No hay errores críticos registrados."}
                                            </p>
                                        </td>
                                    </tr>
                                )}

                                <AnimatePresence mode="popLayout">
                                    {filteredData.map((item, index) => {
                                        const key = `${item.Traspaso}-${index}`;
                                        const isExpanded = expandedRows.has(key);
                                        const dateBC = new Date(item.Fecha_Error_BC);

                                        return (
                                            <React.Fragment key={key}>
                                                <motion.tr
                                                    layout
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    onClick={() => toggleRow(item.Traspaso, index)}
                                                    className={`cursor-pointer transition-colors ${isExpanded ? 'bg-zinc-50/80' : 'hover:bg-zinc-50/50'}`}
                                                >
                                                    <td className="px-6 py-4 pr-0">
                                                        <motion.div
                                                            animate={{ rotate: isExpanded ? 90 : 0 }}
                                                            className="text-zinc-400"
                                                        >
                                                            <ChevronRight className="w-4 h-4" />
                                                        </motion.div>
                                                    </td>
                                                    <td className="px-6 py-4 font-bold text-zinc-900 tracking-tight">{item.Traspaso}</td>
                                                    <td className="px-6 py-4">
                                                        {item.Is_Fake_OK === 1 ? (
                                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-[10px] font-bold border border-amber-200">
                                                                <AlertTriangle className="w-3 h-3" />
                                                                OK (FALLO INTEGRACIÓN)
                                                            </span>
                                                        ) : (
                                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border ${item.Estado_SAT === 'ERROR'
                                                                ? 'bg-red-50 text-red-700 border-red-100'
                                                                : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                                                                }`}>
                                                                {item.Estado_SAT === 'ERROR' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                                {item.Estado_SAT || 'PENDIENTE'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-zinc-600 font-medium whitespace-nowrap">
                                                        <span className="flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                                                            {item.Tipo === 'D' ? (
                                                                <>
                                                                    <ArrowRightLeft className="w-3 h-3 text-indigo-400" /> Despacho
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <ArrowRightLeft className="w-3 h-3 text-amber-400" /> Recepción
                                                                </>
                                                            )}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${item.Motivo_Principal.includes('STOCK')
                                                            ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                                            : 'bg-amber-50 text-amber-700 border border-amber-100'
                                                            }`}>
                                                            {item.Motivo_Principal}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-zinc-500 whitespace-nowrap text-xs">
                                                        {formatDateLocal(item.Fecha_Error_BC)}
                                                    </td>
                                                </motion.tr>

                                                {isExpanded && (
                                                    <motion.tr
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="bg-zinc-50/50"
                                                    >
                                                        <td colSpan={6} className="px-6 py-4 pl-16">
                                                            <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl overflow-hidden">
                                                                <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-b border-zinc-800/50">
                                                                    <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                                                                        <FileJson className="w-3.5 h-3.5" />
                                                                        Detalle técnico del error (LOG BC)
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            copyToClipboard(item.Atributos, key);
                                                                        }}
                                                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-all text-[10px] font-medium border border-white/5"
                                                                    >
                                                                        {copiedKey === key ? (
                                                                            <><Check className="w-3 h-3 text-emerald-400" /> Copiado</>
                                                                        ) : (
                                                                            <><Copy className="w-3 h-3" /> Copiar</>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                                <div className="p-5 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                                                                    <pre className="text-zinc-300 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                                                                        {parseJsonSafe(item.Atributos)}
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
                </div>
            )}
        </motion.div>
    );
}
