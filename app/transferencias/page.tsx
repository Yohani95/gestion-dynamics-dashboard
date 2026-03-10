"use client";

import { useState } from "react";
import { AlertCircle, ArrowRightLeft, CheckCircle2, Search, XCircle, Clock, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import HistorialLogs from "../components/HistorialLogs";
import PanelEstadosTransferencias from "../components/PanelEstadosTransferencias";
import AyudaTransferencias from "../components/AyudaTransferencias";
import ErroresRecientes from "../components/ErroresRecientes";

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
                    <ErroresRecientes />
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
