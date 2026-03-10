"use client";

import { useState, useCallback, useEffect } from "react";
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
  } catch {}
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
    } catch {}
  }, []);

  const openDetalleDesdeLista = (numero: number) => {
    setDetalleNumero(String(numero));
  };

  const closeDetalle = () => {
    setDetalleNumero(null);
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2 rounded-full bg-slate-900/5 p-1 text-sm">
        <button
          type="button"
          onClick={() => setTab("documento")}
          className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
            activeTab === "documento"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-700 hover:bg-slate-200/70"
          }`}
        >
          Documento
        </button>
        <button
          type="button"
          onClick={() => setTab("resumen")}
          className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
            activeTab === "resumen"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-700 hover:bg-slate-200/70"
          }`}
        >
          Resumen por estados
        </button>
        <button
          type="button"
          onClick={() => setTab("lista")}
          className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
            activeTab === "lista"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-700 hover:bg-slate-200/70"
          }`}
        >
          Documentos por fecha
        </button>
        <button
          type="button"
          onClick={() => setTab("ayuda")}
          className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
            activeTab === "ayuda"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-700 hover:bg-slate-200/70"
          }`}
        >
          Ayuda
        </button>
      </div>

      {activeTab === "ayuda" && (
        <section className="mb-10">
          <AyudaContent />
        </section>
      )}

      {activeTab === "documento" && (
        <section className="mb-10">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">
            Consultar documento
          </h1>
          <p className="text-slate-600 text-sm mb-6">
            Ingresa el número de documento (BLE, FCV o NCV) para ver estado en SII,
            envío a Dynamics, líneas en Gestion y opción de reprocesar.
          </p>
          <BusquedaDocumento
            numeroParaCargar={numeroParaCargar}
            onNumeroCargado={onNumeroCargado}
          />
        </section>
      )}

      {activeTab === "resumen" && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Resumen por estados
          </h2>
          <p className="text-slate-600 text-sm mb-4">
            Documentos agrupados por empresa, fecha, tipo (BLE/FCV/NCV) y estado Dynamics.
            Indica fecha desde y los estados que quieras ver (0–4).
          </p>
          <ResumenEstados />
        </section>
      )}

      {activeTab === "lista" && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Documentos por fecha
          </h2>
          <p className="text-slate-600 text-sm mb-4">
            Elige una fecha para listar todos los documentos. Usa &quot;Ver detalle&quot; para abrir
            un resumen rápido del documento y decidir si necesitas reprocesar.
          </p>
          <DocumentosPorFecha onVerDetalle={openDetalleDesdeLista} />
        </section>
      )}

      {detalleNumero && (
        <DetalleDocumentoModal numero={detalleNumero} onClose={closeDetalle} />
      )}
    </>
  );
}

