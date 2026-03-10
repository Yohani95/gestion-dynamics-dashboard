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
    <div className="flex flex-col gap-6">
      {/* Tab Navigation Premium */}
      <div className="flex bg-zinc-100/80 p-1.5 rounded-xl self-start overflow-x-auto max-w-full hide-scrollbar">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${isActive
                  ? "text-zinc-900 shadow-sm ring-1 ring-zinc-200/50"
                  : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-tab-indicator"
                  className="absolute inset-0 bg-white rounded-lg shadow-sm border border-zinc-200/50"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Icon className={`w-4 h-4 ${isActive ? "text-indigo-500" : "text-zinc-400"}`} />
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "ayuda" && (
              <section className="bg-zinc-50/50 rounded-2xl border border-zinc-100 p-2">
                <AyudaContent />
              </section>
            )}

            {activeTab === "documento" && (
              <section className="bg-white rounded-2xl">
                <div className="flex items-start justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-semibold text-zinc-900 flex items-center gap-2">
                      <FileSearch className="w-5 h-5 text-indigo-500" />
                      Rastreador de Documentos
                    </h3>
                    <p className="text-zinc-500 text-sm mt-1 max-w-2xl leading-relaxed">
                      Herramienta principal de diagnóstico. Ingrese el número de folio (BLE, FCV o NCV) para revelar su ciclo de vida completo: estado en el SII, confirmación de envío a Dynamics y la visibilidad de líneas en Gestión. Permite el reprocesamiento seguro en caso de atascamiento.
                    </p>
                  </div>
                </div>
                <div className="bg-zinc-50/50 rounded-2xl p-6 border border-zinc-100">
                  <BusquedaDocumento
                    numeroParaCargar={numeroParaCargar}
                    onNumeroCargado={onNumeroCargado}
                  />
                </div>
              </section>
            )}

            {activeTab === "resumen" && (
              <section className="bg-white rounded-2xl">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-zinc-900 flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-indigo-500" />
                    Vista Ejecutiva por Estados
                  </h3>
                  <p className="text-zinc-500 text-sm mt-1 max-w-2xl leading-relaxed">
                    Panel analítico para agrupar documentos bloqueados o procesados según su estado final en Dynamics. Permite identificar cuellos de botella por empresa, fecha y tipo de documento de forma masiva.
                  </p>
                </div>
                <div className="bg-zinc-50/50 rounded-2xl p-6 border border-zinc-100">
                  <ResumenEstados />
                </div>
              </section>
            )}

            {activeTab === "lista" && (
              <section className="bg-white rounded-2xl">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-zinc-900 flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-indigo-500" />
                    Auditoría Histórica por Fecha
                  </h3>
                  <p className="text-zinc-500 text-sm mt-1 max-w-2xl leading-relaxed">
                    Explorador de línea de tiempo. Seleccione un día calendario para listar todas las transacciones generadas en esa jornada. Incluye acceso rápido al detalle individual para diagnóstico minucioso.
                  </p>
                </div>
                <div className="bg-zinc-50/50 rounded-2xl p-6 border border-zinc-100">
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
