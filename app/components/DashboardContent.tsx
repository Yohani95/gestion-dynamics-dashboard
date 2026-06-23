"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ListChecks,
  CalendarDays,
  HelpCircle,
  FileSearch,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Wrench,
} from "lucide-react";
import BusquedaDocumento from "./BusquedaDocumento";
import DocumentosPorFecha from "./DocumentosPorFecha";
import ResumenEstados from "./ResumenEstados";
import DetalleDocumentoModal from "./DetalleDocumentoModal";
import AyudaContent from "./AyudaContent";
import ReconciliacionDynamics, { type ReconciliacionDynamicsEstado } from "./ReconciliacionDynamics";

const RECONCILIACION_ESTADO_INICIAL: ReconciliacionDynamicsEstado = {
  procesando: false,
  fecha: null,
  loteActual: 0,
  totalLotes: 0,
  docsProcesados: 0,
  totalDocs: 0,
  resultado: null,
};

const TAB_STORAGE_KEY = "gestion-dash-tab";
type TabId = "documento" | "resumen" | "lista" | "reconciliacion" | "ayuda";

const VALID_TABS: TabId[] = ["documento", "resumen", "lista", "reconciliacion", "ayuda"];

const LEGACY_TAB_REDIRECT: Record<string, TabId> = {
  reproceso: "documento",
  auditor: "documento",
};

function loadSavedTab(): TabId {
  if (typeof window === "undefined") return "documento";
  try {
    const t = sessionStorage.getItem(TAB_STORAGE_KEY);
    if (t && VALID_TABS.includes(t as TabId)) return t as TabId;
    if (t && LEGACY_TAB_REDIRECT[t]) return LEGACY_TAB_REDIRECT[t];
  } catch {
    /* ignore */
  }
  return "documento";
}

export default function DashboardContent() {
  const [activeTab, setActiveTab] = useState<TabId>("documento");
  type DetalleParam = { numero: string; tipo?: string; empresa?: string };
  const [detalleParam, setDetalleParam] = useState<DetalleParam | null>(null);
  const [numeroParaCargar, setNumeroParaCargar] = useState<string | null>(null);
  const [reconciliacionEstado, setReconciliacionEstado] = useState<ReconciliacionDynamicsEstado>(
    RECONCILIACION_ESTADO_INICIAL,
  );
  const onNumeroCargado = useCallback(() => setNumeroParaCargar(null), []);
  const onReconciliacionEstadoChange = useCallback((estado: ReconciliacionDynamicsEstado) => {
    setReconciliacionEstado(estado);
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

  const openDetalleDesdeLista = (numero: number | string, tipo?: string, empresa?: string) => {
    setDetalleParam({ numero: String(numero), tipo, empresa });
  };

  const closeDetalle = () => {
    setDetalleParam(null);
  };

  const tabs = [
    { id: "documento", label: "Consultar", icon: Search },
    { id: "resumen", label: "Resumen", icon: ListChecks },
    { id: "lista", label: "Por Fecha", icon: CalendarDays },
    { id: "reconciliacion", label: "Reconciliación BC", icon: RefreshCw },
    { id: "ayuda", label: "Ayuda", icon: HelpCircle },
  ] as const;

  const mostrarBannerReconciliacion =
    activeTab !== "reconciliacion" &&
    (reconciliacionEstado.procesando || reconciliacionEstado.resultado != null);

  const tabPersistente = activeTab === "reconciliacion";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex bg-zinc-100/50 backdrop-blur-md p-1.5 rounded-2xl self-start overflow-x-auto max-w-full hide-scrollbar border border-zinc-200/50 shadow-inner">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 whitespace-nowrap ${
                  isActive
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
                <span className="relative z-10 flex items-center gap-2">
                  <Icon
                    className={`w-4 h-4 transition-colors ${isActive ? "text-indigo-600" : "text-zinc-400"}`}
                  />
                  {tab.label}
                  {tab.id === "reconciliacion" && reconciliacionEstado.procesando && (
                    <span className="inline-flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" aria-hidden />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <Link
          href="/ventas/herramientas"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-indigo-700 transition-colors"
        >
          <Wrench className="w-4 h-4 text-zinc-500" />
          Auditor BC y Reproceso Excel
        </Link>
      </div>

      {mostrarBannerReconciliacion && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            reconciliacionEstado.procesando
              ? "border-indigo-200 bg-indigo-50 text-indigo-950"
              : reconciliacionEstado.resultado?.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold flex items-center gap-2">
                {reconciliacionEstado.procesando ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : reconciliacionEstado.resultado?.ok ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {reconciliacionEstado.procesando ? "Reconciliación BC en curso" : "Reconciliación BC finalizada"}
              </p>
              <p className="mt-1">
                {reconciliacionEstado.procesando
                  ? `${reconciliacionEstado.fecha ?? ""} · lote ${reconciliacionEstado.loteActual} de ${reconciliacionEstado.totalLotes} · ${reconciliacionEstado.docsProcesados}/${reconciliacionEstado.totalDocs} docs`
                  : reconciliacionEstado.resultado?.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab("reconciliacion")}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50"
            >
              Ver detalle
            </button>
          </div>
        </div>
      )}

      <div className="min-h-[550px]">
        <div className={activeTab === "reconciliacion" ? "block" : "hidden"} aria-hidden={activeTab !== "reconciliacion"}>
          <section className="bg-white">
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <RefreshCw className="w-6 h-6 text-indigo-600" />
                </div>
                Reconciliación masiva con Business Central
              </h3>
              <p className="text-zinc-500 text-base mt-2 max-w-3xl leading-relaxed">
                Compare documentos por rango de fechas contra BC, detecte los registrados manualmente en Dynamics y
                sincronice el estado en Gestión de forma controlada.
              </p>
            </div>
            <div className="bg-zinc-50/40 backdrop-blur-sm rounded-3xl p-8 border border-zinc-100/80 shadow-sm">
              <ReconciliacionDynamics onEstadoChange={onReconciliacionEstadoChange} />
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
              transition={{ type: "spring", stiffness: 260, damping: 25 }}
            >
              {activeTab === "ayuda" && (
                <section className="bg-zinc-50/30 backdrop-blur-sm rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
                  <AyudaContent />
                </section>
              )}

              {activeTab === "documento" && (
                <section className="bg-white">
                  <div className="mb-10">
                    <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 rounded-xl">
                        <FileSearch className="w-6 h-6 text-indigo-600" />
                      </div>
                      Rastreador de Documentos
                    </h3>
                    <p className="text-zinc-500 text-base mt-2 max-w-3xl leading-relaxed">
                      Seguimiento del ciclo de vida: SII, envío a Dynamics, líneas y errores por documento.
                    </p>
                  </div>
                  <div className="bg-zinc-50/40 backdrop-blur-sm rounded-3xl p-8 border border-zinc-100/80 shadow-sm">
                    <BusquedaDocumento numeroParaCargar={numeroParaCargar} onNumeroCargado={onNumeroCargado} />
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
                      Agrupación por empresa, fecha y estado de integración con Dynamics.
                    </p>
                  </div>
                  <div className="bg-zinc-50/40 backdrop-blur-sm rounded-3xl p-8 border border-zinc-100/80 shadow-sm">
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
                      Listado cronológico con filtros por empresa y tipo de documento.
                    </p>
                  </div>
                  <div className="bg-zinc-50/40 backdrop-blur-sm rounded-3xl p-8 border border-zinc-100/80 shadow-sm">
                    <DocumentosPorFecha onVerDetalle={openDetalleDesdeLista} />
                  </div>
                </section>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {detalleParam && <DetalleDocumentoModal param={detalleParam} onClose={closeDetalle} />}
    </div>
  );
}
