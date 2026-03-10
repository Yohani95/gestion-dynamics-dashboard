"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ListChecks, CalendarDays, HelpCircle, FileSearch } from "lucide-react";
import BusquedaDocumento from "./BusquedaDocumento";
import DocumentosPorFecha from "./DocumentosPorFecha";
import ResumenEstados from "./ResumenEstados";
import DetalleDocumentoModal from "./DetalleDocumentoModal";
import AyudaContent from "./AyudaContent";

const TAB_STORAGE_KEY = "gestion-dash-tab";
type TabId = "documento" | "resumen" | "lista" | "ayuda";

const VALID_TABS: TabId[] = ["documento", "resumen", "lista", "ayuda"];
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
  const [detalleNumero, setDetalleNumero] = useState<string | null>(null);
  const [numeroParaCargar, setNumeroParaCargar] = useState<string | null>(null);
  const onNumeroCargado = useCallback(() => setNumeroParaCargar(null), []);

  useEffect(() => {
    setActiveTab(loadSavedTab());
  }, []);

  const setTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch { }
  }, []);

  const openDetalleDesdeLista = (numero: number) => {
    setDetalleNumero(String(numero));
  };

  const closeDetalle = () => {
    setDetalleNumero(null);
  };

  const tabs = [
    { id: "documento", label: "Consultar Documento", icon: Search },
    { id: "resumen", label: "Resumen por Estados", icon: ListChecks },
    { id: "lista", label: "Historial por Fecha", icon: CalendarDays },
    { id: "ayuda", label: "Centro de Ayuda", icon: HelpCircle },
  ] as const;

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
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Area with refined transitions */}
      <div className="min-h-[550px]">
        <AnimatePresence mode="wait">
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
        </AnimatePresence>
      </div>

      {detalleNumero && (
        <DetalleDocumentoModal numero={detalleNumero} onClose={closeDetalle} />
      )}
    </div>
  );
}
