"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scale,
  FileSpreadsheet,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
} from "lucide-react";
import ReprocesoMasivoExcel, { type ReprocesoExcelEstado } from "./ReprocesoMasivoExcel";
import AuditorDynamics, { type AuditorDynamicsEstado } from "./AuditorDynamics";

const REPROCESO_ESTADO_INICIAL: ReprocesoExcelEstado = {
  procesando: false,
  archivoNombre: null,
  loteActual: 0,
  totalLotes: 0,
  filasProcesadas: 0,
  totalFilas: 0,
  resultado: null,
};

const AUDITOR_ESTADO_INICIAL: AuditorDynamicsEstado = {
  procesando: false,
  fecha: null,
  loteActual: 0,
  totalLotes: 0,
  docsProcesados: 0,
  totalDocs: 0,
  resultado: null,
};

const TAB_STORAGE_KEY = "gestion-dash-herramientas-tab";
type TabId = "auditor" | "reproceso";

function loadSavedTab(): TabId {
  if (typeof window === "undefined") return "auditor";
  try {
    const t = sessionStorage.getItem(TAB_STORAGE_KEY);
    if (t === "auditor" || t === "reproceso") return t;
  } catch {
    /* ignore */
  }
  return "auditor";
}

export default function HerramientasVentasContent() {
  const [activeTab, setActiveTab] = useState<TabId>("auditor");
  const [reprocesoEstado, setReprocesoEstado] = useState<ReprocesoExcelEstado>(REPROCESO_ESTADO_INICIAL);
  const [auditorEstado, setAuditorEstado] = useState<AuditorDynamicsEstado>(AUDITOR_ESTADO_INICIAL);

  const onReprocesoEstadoChange = useCallback((estado: ReprocesoExcelEstado) => {
    setReprocesoEstado(estado);
  }, []);

  const onAuditorEstadoChange = useCallback((estado: AuditorDynamicsEstado) => {
    setAuditorEstado(estado);
  }, []);

  useEffect(() => {
    setActiveTab(loadSavedTab());
  }, []);

  const setTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      /* ignore */
    }
  }, []);

  const tabs = [
    { id: "auditor" as const, label: "Auditor BC", icon: Scale },
    { id: "reproceso" as const, label: "Reproceso Excel", icon: FileSpreadsheet },
  ];

  const mostrarBannerReproceso =
    activeTab !== "reproceso" && (reprocesoEstado.procesando || reprocesoEstado.resultado != null);

  const mostrarBannerAuditor =
    activeTab !== "auditor" && (auditorEstado.procesando || auditorEstado.resultado != null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link
          href="/ventas"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-500 w-fit"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a diagnóstico de ventas
        </Link>
      </div>

      <div className="flex bg-zinc-100/50 backdrop-blur-md p-1.5 rounded-2xl self-start overflow-x-auto max-w-full hide-scrollbar border border-zinc-200/50 shadow-inner">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={`relative flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${
                isActive ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-800 hover:bg-white/40"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="herramientas-tab-glow"
                  className="absolute inset-0 bg-white rounded-xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)] border border-zinc-200/60"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-zinc-400"}`} />
                {tab.label}
                {tab.id === "reproceso" && reprocesoEstado.procesando && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" aria-hidden />
                )}
                {tab.id === "auditor" && auditorEstado.procesando && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-violet-500 animate-pulse" aria-hidden />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {mostrarBannerAuditor && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            auditorEstado.procesando
              ? "border-violet-200 bg-violet-50 text-violet-950"
              : auditorEstado.resultado?.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold flex items-center gap-2">
                {auditorEstado.procesando ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : auditorEstado.resultado?.ok ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {auditorEstado.procesando ? "Auditor BC en curso" : "Auditor BC finalizado"}
              </p>
              <p className="mt-1 text-sm">
                {auditorEstado.procesando
                  ? `${auditorEstado.fecha ?? ""} · lote ${auditorEstado.loteActual}/${auditorEstado.totalLotes} · ${auditorEstado.docsProcesados}/${auditorEstado.totalDocs} docs`
                  : auditorEstado.resultado?.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab("auditor")}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50"
            >
              Ver detalle
            </button>
          </div>
        </div>
      )}

      {mostrarBannerReproceso && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            reprocesoEstado.procesando
              ? "border-indigo-200 bg-indigo-50 text-indigo-950"
              : reprocesoEstado.resultado?.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-rose-200 bg-rose-50 text-rose-950"
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold flex items-center gap-2">
                {reprocesoEstado.procesando ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : reprocesoEstado.resultado?.ok ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {reprocesoEstado.procesando ? "Reproceso Excel en curso" : "Reproceso Excel finalizado"}
              </p>
              <p className="mt-1 text-sm">
                {reprocesoEstado.procesando
                  ? `${reprocesoEstado.archivoNombre ?? "Archivo"} · lote ${reprocesoEstado.loteActual}/${reprocesoEstado.totalLotes} · ${reprocesoEstado.filasProcesadas}/${reprocesoEstado.totalFilas} filas`
                  : reprocesoEstado.resultado?.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab("reproceso")}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50"
            >
              Ver detalle
            </button>
          </div>
        </div>
      )}

      <div className="min-h-[480px]">
        <div className={activeTab === "auditor" ? "block" : "hidden"} aria-hidden={activeTab !== "auditor"}>
          <section>
            <div className="mb-6">
              <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-3">
                <div className="p-2 bg-violet-50 rounded-xl">
                  <Scale className="w-5 h-5 text-violet-600" />
                </div>
                Auditor Gestión vs Business Central
              </h3>
              <p className="text-zinc-500 text-sm mt-2 max-w-3xl leading-relaxed">
                Compare documentos por fechas contra BC: montos, líneas y diferencias. Solo diagnóstico, sin modificar estados.
              </p>
            </div>
            <div className="bg-zinc-50/40 rounded-3xl p-6 sm:p-8 border border-zinc-100/80 shadow-sm">
              <AuditorDynamics onEstadoChange={onAuditorEstadoChange} />
            </div>
          </section>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "reproceso" && (
            <motion.section
              key="reproceso"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-6">
                <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-xl">
                    <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                  </div>
                  Reproceso masivo por Excel
                </h3>
                <p className="text-zinc-500 text-sm mt-2 max-w-3xl leading-relaxed">
                  Cargue un Excel con RUT, folio y tipo para reprocesar lotes hacia Dynamics.
                </p>
              </div>
              <div className="bg-zinc-50/40 rounded-3xl p-6 sm:p-8 border border-zinc-100/80 shadow-sm">
                <ReprocesoMasivoExcel onEstadoChange={onReprocesoEstadoChange} />
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
