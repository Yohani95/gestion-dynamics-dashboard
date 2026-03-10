"use client";

import { useState } from "react";
import { AlertCircle, ArrowRightLeft, CheckCircle2, Search, XCircle, Clock, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import HistorialLogs from "../components/HistorialLogs";
import PanelEstadosTransferencias from "../components/PanelEstadosTransferencias";
import AyudaTransferencias from "../components/AyudaTransferencias";

export default function Transferencias() {
    const [activeTab, setActiveTab] = useState<"logs" | "estados" | "historial" | "ayuda">("logs");

    return (
        <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                        <ArrowRightLeft className="w-6 h-6 text-indigo-500" />
                        Traspasos Dynamics
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                        Monitoreo y recuperación de transferencias entre SAT y Business Central.
                    </p>
                </div>

                <div className="flex bg-zinc-100 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab("logs")}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === "logs"
                            ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                            : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                            }`}
                    >
                        Errores Recientes (3 días)
                    </button>
                    <button
                        onClick={() => setActiveTab("historial")}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === "historial"
                            ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                            : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                            }`}
                    >
                        Historial General
                    </button>
                    <button
                        onClick={() => setActiveTab("estados")}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === "estados"
                            ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                            : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                            }`}
                    >
                        Panel de Estados
                    </button>
                    <button
                        onClick={() => setActiveTab("ayuda")}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === "ayuda"
                            ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                            : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                            }`}
                    >
                        Ayuda
                    </button>
                </div>
            </header>

            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-zinc-200/50 overflow-hidden">
                {activeTab === "historial" && (
                    <HistorialLogs />
                )}

                {activeTab === "logs" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-6 md:p-8"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-zinc-900">Historial de Fallos Recuperables</h3>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 border border-indigo-100">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                </span>
                                Auto-Recuperación Activa
                            </span>
                        </div>

                        <div className="bg-zinc-50/80 rounded-xl p-4 border border-zinc-100 mb-8 flex items-start gap-4">
                            <div className="bg-emerald-100 text-emerald-600 p-2 rounded-lg shrink-0 mt-0.5">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="font-medium text-zinc-900 text-sm">El Job de Auto-Recuperación está operando</h4>
                                <p className="text-zinc-600 text-sm mt-1 mb-2 leading-relaxed">
                                    Los traspasos que fallaron por <b>falta de inventario</b> o <b>bloqueos temporales</b> en las últimas 72 horas serán intentados nuevamente de forma automática. Si resuelves una incidencia manual en Dynamics, recuerda marcarla en la base de datos como <code className="bg-zinc-200 px-1.5 py-0.5 rounded text-xs text-zinc-800 font-mono">TERMINADO</code> para que el sistema deje de reprocesar el envío.
                                </p>
                            </div>
                        </div>

                        {/* Simulación del Grid de ERRORES de TRANSF */}
                        <div className="border border-zinc-200 rounded-lg overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-medium whitespace-nowrap">
                                    <tr>
                                        <th className="px-5 py-3.5 pl-6">Nº Traspaso</th>
                                        <th className="px-5 py-3.5">Estado SAT</th>
                                        <th className="px-5 py-3.5">Acción</th>
                                        <th className="px-5 py-3.5">Motivo Principal</th>
                                        <th className="px-5 py-3.5 hidden lg:table-cell">Último Intento</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                    <tr className="hover:bg-zinc-50/50 transition-colors">
                                        <td className="px-5 py-4 pl-6 font-medium text-zinc-900">TRANS000002330</td>
                                        <td className="px-5 py-4">
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                                                <Clock className="w-3.5 h-3.5" />
                                                PENDIENTE
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-zinc-600">Despacho</td>
                                        <td className="px-5 py-4">
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 px-2.5 py-1 text-xs font-medium border border-red-100/50">
                                                <XCircle className="w-3.5 h-3.5" />
                                                SIN STOCK EN ORIGEN
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-zinc-500 hidden lg:table-cell">Hace 2 horas</td>
                                    </tr>
                                    <tr className="hover:bg-zinc-50/50 transition-colors">
                                        <td className="px-5 py-4 pl-6 font-medium text-zinc-900">TRANS000002172</td>
                                        <td className="px-5 py-4">
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 px-2.5 py-1 text-xs font-semibold border border-red-100">
                                                <AlertCircle className="w-3.5 h-3.5" />
                                                ERROR
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-zinc-600">Recepción</td>
                                        <td className="px-5 py-4">
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-xs font-medium border border-amber-100/50">
                                                <Clock className="w-3.5 h-3.5" />
                                                BLOQUEO TEMP (LOCKING)
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-zinc-500 hidden lg:table-cell">Ayer, 18:30 hrs</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center justify-center text-sm text-slate-500 h-24">
                                {/* Aqui puedes conectar el componente Data fetching hacia SQL SERVER para "Test_05"  */}
                                Los datos mostrados arriba son un mockup del diseño. Conecta este componente a la consulta <b>Test_05_Buscar_Errores_Logs</b>.
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === "estados" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <PanelEstadosTransferencias />
                    </motion.div>
                )}

                {activeTab === "ayuda" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <AyudaTransferencias />
                    </motion.div>
                )}
            </div>
        </div>
    );
}
