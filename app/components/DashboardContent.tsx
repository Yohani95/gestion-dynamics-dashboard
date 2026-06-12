"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ListChecks, CalendarDays, HelpCircle, FileSearch, FileSpreadsheet, Scale, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";
import BusquedaDocumento from "./BusquedaDocumento";
import DocumentosPorFecha from "./DocumentosPorFecha";
import ResumenEstados from "./ResumenEstados";
import DetalleDocumentoModal from "./DetalleDocumentoModal";
import AyudaContent from "./AyudaContent";
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

const TAB_STORAGE_KEY = "gestion-dash-tab";
type TabId = "documento" | "resumen" | "lista" | "reproceso" | "auditor" | "ayuda";

const VALID_TABS: TabId[] = ["documento", "resumen", "lista", "reproceso", "auditor", "ayuda"];
function loadSavedTab(): TabId {
  if (typeof window === "undefined") return "documento";
  try {
    const t = sessionStorage.getItem(TAB_STORAGE_KEY);
    if (t && VALID_TABS.includes(t as TabId)) return t as TabId;
  } catch { }
  return "documento";
}

export default function DashboardContent() {
  const [activeTab, setActiveTab] = useState<TabId>("documento");
  type DetalleParam = { numero: string; tipo?: string; empresa?: string };
  const [detalleParam, setDetalleParam] = useState<DetalleParam | null>(null);
  const [numeroParaCargar, setNumeroParaCargar] = useState<string | null>(null);
  const [reprocesoEstado, setReprocesoEstado] = useState<ReprocesoExcelEstado>(REPROCESO_ESTADO_INICIAL);
  const [auditorEstado, setAuditorEstado] = useState<AuditorDynamicsEstado>(AUDITOR_ESTADO_INICIAL);
  const onNumeroCargado = useCallback(() => setNumeroParaCargar(null), []);
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
    } catch { }
  }, []);

  const openDetalleDesdeLista = (numero: number | string, tipo?: string, empresa?: string) => {
    setDetalleParam({ numero: String(numero), tipo, empresa });
  };

  const closeDetalle = () => {
    setDetalleParam(null);
  };

  const tabs = [
    { id: "documento", label: "Consultar Documento", icon: Search },
    { id: "resumen", label: "Resumen por Estados", icon: ListChecks },
    { id: "lista", label: "Historial por Fecha", icon: CalendarDays },
    { id: "reproceso", label: "Reproceso Excel", icon: FileSpreadsheet },
    { id: "auditor", label: "Auditor BC", icon: Scale },
    { id: "ayuda", label: "Centro de Ayuda", icon: HelpCircle },
  ] as const;

  const mostrarBannerReproceso =
    activeTab !== "reproceso" &&
    (reprocesoEstado.procesando || reprocesoEstado.resultado != null);

  const mostrarBannerAuditor =
    activeTab !== "auditor" &&
    (auditorEstado.procesando || auditorEstado.resultado != null);

  const tabPersistente = activeTab === "reproceso" || activeTab === "auditor";

  return (
    <div className="flex flex-col gap-8">
      {/* Tab Navigation Premium (Glassmorphism) */}
      <div className="flex bg-zinc-100/50 backdrop-blur-md p-1.5 rounded-2xl self-start overflow-x-auto max-w-full hide-scrollbar border border-zinc-200/50 shadow-inner">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`relative flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-500 ${isActive
                ? "text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800 hover:bg-white/40"
                }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-tab-glow"
                  className="absolute inset-0 bg-white rounded-xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)] border border-zinc-200/60"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2.5">
                <Icon className={`w-4.5 h-4.5 transition-colors duration-500 ${isActive ? "text-indigo-600" : "text-zinc-400"}`} />
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
              <p className="mt-1">
                {auditorEstado.procesando
                  ? `${auditorEstado.fecha ?? ""} · lote ${auditorEstado.loteActual} de ${auditorEstado.totalLotes} · ${auditorEstado.docsProcesados}/${auditorEstado.totalDocs} docs`
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
                {reprocesoEstado.procesando
                  ? "Reproceso Excel en curso"
                  : "Reproceso Excel finalizado"}
              </p>
              <p className="mt-1">
                {reprocesoEstado.procesando
                  ? `${reprocesoEstado.archivoNombre ?? "Archivo"} · lote ${reprocesoEstado.loteActual} de ${reprocesoEstado.totalLotes} · ${reprocesoEstado.filasProcesadas}/${reprocesoEstado.totalFilas} filas`
                  : reprocesoEstado.resultado?.text}
              </p>
              {reprocesoEstado.procesando && (
                <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-indigo-100">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                    style={{
                      width: `${reprocesoEstado.totalFilas ? Math.round((reprocesoEstado.filasProcesadas / reprocesoEstado.totalFilas) * 100) : 0}%`,
                    }}
                  />
                </div>
              )}
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

      {/* Content Area with refined transitions */}
      <div className="min-h-[550px]">
        <div className={activeTab === "auditor" ? "block" : "hidden"} aria-hidden={activeTab !== "auditor"}>
          <section className="bg-white">
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
                <div className="p-2 bg-violet-50 rounded-xl">
                  <Scale className="w-6 h-6 text-violet-600" />
                </div>
                Auditor Gestión vs Business Central
              </h3>
              <p className="text-zinc-500 text-base mt-2 max-w-3xl leading-relaxed">
                Seleccione un rango de fechas y compare documentos contra BC: montos, líneas, faltantes en Dynamics y líneas duplicadas. Use filtros y paginación para revisar volúmenes grandes.
              </p>
            </div>
            <div className="bg-zinc-50/40 backdrop-blur-sm rounded-3xl p-8 border border-zinc-100/80 shadow-sm transition-all hover:shadow-md duration-500">
              <AuditorDynamics onEstadoChange={onAuditorEstadoChange} />
            </div>
          </section>
        </div>

        <div className={activeTab === "reproceso" ? "block" : "hidden"} aria-hidden={activeTab !== "reproceso"}>
          <section className="bg-white">
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
                </div>
                Reproceso masivo por Excel
              </h3>
              <p className="text-zinc-500 text-base mt-2 max-w-3xl leading-relaxed">
                Cargue un Excel con RUT de empresa, numero de folio y tipo de documento para reprocesar lotes hacia Dynamics sin buscar uno a uno.
              </p>
            </div>
            <div className="bg-zinc-50/40 backdrop-blur-sm rounded-3xl p-8 border border-zinc-100/80 shadow-sm transition-all hover:shadow-md duration-500">
              <ReprocesoMasivoExcel onEstadoChange={onReprocesoEstadoChange} />
            </div>
          </section>
        </div>

        <AnimatePresence mode="wait">
          {!tabPersistente && (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: -8 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 25
            }}
          >
            {activeTab === "ayuda" && (
              <section className="bg-zinc-50/30 backdrop-blur-sm rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
                <AyudaContent />
              </section>
            )}

            {activeTab === "documento" && (
              <section className="bg-white">
                <div className="flex items-start justify-between mb-10">
                  <div>
                    <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 rounded-xl">
                        <FileSearch className="w-6 h-6 text-indigo-600" />
                      </div>
                      Rastreador de Documentos
                    </h3>
                    <p className="text-zinc-500 text-base mt-2 max-w-3xl leading-relaxed">
                      Herramienta inteligente de diagnóstico. Realice un seguimiento en tiempo real del ciclo de vida de sus documentos: desde la validación del SII hasta la integración final en Dynamics.
                    </p>
                  </div>
                </div>
                <div className="bg-zinc-50/40 backdrop-blur-sm rounded-3xl p-8 border border-zinc-100/80 shadow-sm transition-all hover:shadow-md duration-500">
                  <BusquedaDocumento
                    numeroParaCargar={numeroParaCargar}
                    onNumeroCargado={onNumeroCargado}
                  />
                </div>
              </section>
            )}

            {activeTab === "resumen" && (
              <section className="bg-white">
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-xl">
                      <ListChecks className="w-6 h-6 text-indigo-600" />
                    </div>
                    Vista Ejecutiva por Estados
                  </h3>
                  <p className="text-zinc-500 text-base mt-2 max-w-3xl leading-relaxed">
                    Panel analítico avanzado. Obtenga una visión panorámica de la salud operacional agrupando documentos por su estado de integración masiva.
                  </p>
                </div>
                <div className="bg-zinc-50/40 backdrop-blur-sm rounded-3xl p-8 border border-zinc-100/80 shadow-sm transition-all hover:shadow-md duration-500">
                  <ResumenEstados />
                </div>
              </section>
            )}

            {activeTab === "lista" && (
              <section className="bg-white">
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-xl">
                      <CalendarDays className="w-6 h-6 text-indigo-600" />
                    </div>
                    Auditoría Histórica por Fecha
                  </h3>
                  <p className="text-zinc-500 text-base mt-2 max-w-3xl leading-relaxed">
                    Explorador cronológico. Acceda a la línea de tiempo completa de las transacciones generadas, con filtros dinámicos por empresa y tipo de documento.
                  </p>
                </div>
                <div className="bg-zinc-50/40 backdrop-blur-sm rounded-3xl p-8 border border-zinc-100/80 shadow-sm transition-all hover:shadow-md duration-500">
                  <DocumentosPorFecha onVerDetalle={openDetalleDesdeLista} />
                </div>
              </section>
            )}

          </motion.div>
          )}
        </AnimatePresence>
      </div>

      {detalleParam && (
        <DetalleDocumentoModal param={detalleParam} onClose={closeDetalle} />
      )}
    </div>
  );
}
