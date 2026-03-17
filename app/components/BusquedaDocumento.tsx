"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, FileText, CheckCircle2, Clock, ArrowRight, ShieldCheck,
  Database, AlertCircle, RefreshCw, Globe, ArrowUpRight, Copy, Check,
  ExternalLink, FileSearch, ListChecks, XCircle, Printer
} from "lucide-react";
import DetalleLineas from "./DetalleLineas";
import { useInstance, fetchWithInstance } from "./InstanceContext";
import { formatDateLocal } from "@/lib/formatUtils";
import { rowsToCsv, downloadCsv, downloadXlsxTable, triggerPrint } from "@/lib/exportUtils";

const NUMERO_STORAGE_KEY = "gestion-dash-documento-numero";
const RESULT_STORAGE_KEY = "gestion-dash-documento-result";

function loadSavedNumero(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(NUMERO_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveNumero(value: string) {
  try {
    sessionStorage.setItem(NUMERO_STORAGE_KEY, value);
  } catch { }
}

function loadSavedResult(): ApiResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ApiResponse;
  } catch {
    return null;
  }
}

function saveResult(value: ApiResponse) {
  try {
    sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(value));
  } catch { }
}

type Documento = {
  tipo: string;
  numero: number;
  idDocumento: string;
  codEmpresa: string;
  fechaEmision: string;
  estadoSII: number | null;
  estadoEnvio: number | null;
  idDocumentoDynamics: string | null;
  lineasGestion?: number;
  lineasDynamicsOk?: number;
};

type ErrorItem = {
  fecha: string;
  mensaje: string;
  tipo: string;
  numero: string;
  error: string;
};

type UltimoLog = { estado: number | null; fecha: string | null } | null;

type ApiResponse = {
  numero: string;
  documento: Documento | null;
  documentosPosibles?: Documento[];
  errores: ErrorItem[];
  ultimoLog?: UltimoLog;
  diagnostico: string;
  error?: string;
  stack?: string;
};

type BusquedaDocumentoProps = {
  numeroParaCargar?: string | null;
  onNumeroCargado?: () => void;
};

type DocumentoLookupFilters = {
  empresa?: string | null;
  tipo?: string | null;
};

export default function BusquedaDocumento({ numeroParaCargar, onNumeroCargado }: BusquedaDocumentoProps) {
  const { instance } = useInstance();
  const [numero, setNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [reprocesando, setReprocesando] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [reprocesoMsg, setReprocesoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [accionMsg, setAccionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enviandoSII, setEnviandoSII] = useState(false);
  const [empresa, setEmpresa] = useState("");
  const [tipo, setTipo] = useState("");
  const [empresas, setEmpresas] = useState<{ codEmpresa: string; descripcion: string }[]>([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);

  const buildDocumentoUrl = (numeroBusqueda: string, filters?: DocumentoLookupFilters) => {
    let url = `/api/documento?numero=${encodeURIComponent(numeroBusqueda)}`;
    const empresaFiltro = (filters?.empresa ?? "").trim();
    const tipoFiltro = (filters?.tipo ?? "").trim();
    if (empresaFiltro) url += `&empresa=${encodeURIComponent(empresaFiltro)}`;
    if (tipoFiltro) url += `&tipo=${encodeURIComponent(tipoFiltro)}`;
    return url;
  };

  const fetchDocumento = async (numeroBusqueda: string, filters?: DocumentoLookupFilters) => {
    const res = await fetchWithInstance(buildDocumentoUrl(numeroBusqueda, filters), {}, instance);
    const json: ApiResponse = await res.json();
    return { res, json };
  };

  const refreshDocumento = async (numeroBusqueda: string, filters?: DocumentoLookupFilters) => {
    const { json } = await fetchDocumento(numeroBusqueda, filters);
    setData(json);
    saveResult(json);
    return json;
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingEmpresas(true);
    fetchWithInstance("/api/empresas", {}, instance)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.empresas) setEmpresas(json.empresas);
      })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoadingEmpresas(false); });
    return () => { cancelled = true; };
  }, [instance]);

  useEffect(() => {
    const savedNum = loadSavedNumero();
    setNumero(savedNum);
    const saved = loadSavedResult();
    if (saved && saved.numero && saved.numero === savedNum.trim()) {
      setData(saved);
    }
  }, []);

  useEffect(() => {
    if (!numeroParaCargar?.trim()) return;
    const n = numeroParaCargar.trim();
    setNumero(n);
    saveNumero(n);
    setData(null);
    setLoading(true);
    setReprocesoMsg(null);
    fetchDocumento(n, { empresa, tipo })
      .then(({ json }) => {
        setData(json);
        saveResult(json);
      })
      .catch(() => {
        const fallback: ApiResponse = { numero: n, documento: null, errores: [], diagnostico: "Error de red.", error: "Error de red" };
        setData(fallback);
        saveResult(fallback);
      })
      .finally(() => {
        setLoading(false);
        onNumeroCargado?.();
      });
  }, [numeroParaCargar, onNumeroCargado, instance, empresa, tipo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = numero.trim();
    if (!n) return;
    saveNumero(n);
    setLoading(true);
    setData(null);
    setReprocesoMsg(null);
    setAccionMsg(null);
    try {
      const { res, json } = await fetchDocumento(n, { empresa, tipo });
      setData(json);
      saveResult(json);
      if (!res.ok && json.error) {
        console.error("[API]", json.error, json.stack ?? "");
      }
    } catch (err) {
      setData({
        numero: n,
        documento: null,
        errores: [],
        diagnostico: "Error de red al consultar.",
        error: String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleReprocesar() {
    if (!data?.documento || !data.numero) return;
    setReprocesando(true);
    setReprocesoMsg(null);
    setAccionMsg(null);
    console.log(data.documento.idDocumento);
    console.log(data.documento.tipo);
    console.log(data.documento.codEmpresa);
    console.log(data.documento.fechaEmision );
    try {
      const res = await fetchWithInstance("/api/documento/reprocesar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: data.numero,
          tipo: data.documento.tipo,
          idDocumento: data.documento.idDocumento,
          codEmpresa: data.documento.codEmpresa,
          fecha: data.documento.fechaEmision,
        }),
      }, instance);
      const json = await res.json();
      setReprocesoMsg({
        ok: json.ok === true,
        text: json.mensaje ?? json.error ?? (res.ok ? "Reproceso ejecutado." : "Error al reprocesar."),
      });
      if (json.ok && data.numero) {
        await refreshDocumento(data.numero, {
          tipo: data.documento.tipo,
          empresa: data.documento.codEmpresa,
        });
      }
    } catch (err) {
      setReprocesoMsg({ ok: false, text: String(err) });
    } finally {
      setReprocesando(false);
    }
  }

  async function handleLocalizar() {
    if (!data?.documento || !data.numero) return;
    setLocalizando(true);
    setAccionMsg(null);
    try {
      const res = await fetchWithInstance("/api/documento/localizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: data.numero,
          tipo: data.documento.tipo,
          codEmpresa: data.documento.codEmpresa,
          fecha: data.documento.fechaEmision,
        }),
      }, instance);
      const json = await res.json();
      setAccionMsg({
        ok: json.ok === true,
        text: json.mensaje ?? json.error ?? (res.ok ? "Localización ejecutada." : "Error al localizar."),
      });
      if (json.ok && data.numero) {
        await refreshDocumento(data.numero, {
          tipo: data.documento.tipo,
          empresa: data.documento.codEmpresa,
        });
      }
    } catch (err) {
      setAccionMsg({ ok: false, text: String(err) });
    } finally {
      setLocalizando(false);
    }
  }

  async function handleRegistrar() {
    if (!data?.documento || !data.numero) return;
    setRegistrando(true);
    setAccionMsg(null);
    try {
      const res = await fetchWithInstance("/api/documento/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: data.numero,
          tipo: data.documento.tipo,
          codEmpresa: data.documento.codEmpresa,
          fecha: data.documento.fechaEmision,
          documento: String(data.documento.numero),
        }),
      }, instance);
      const json = await res.json();
      setAccionMsg({
        ok: json.ok === true,
        text: json.mensaje ?? json.error ?? (res.ok ? "Registro ejecutado." : "Error al registrar."),
      });
      if (json.ok && data.numero) {
        await refreshDocumento(data.numero, {
          tipo: data.documento.tipo,
          empresa: data.documento.codEmpresa,
        });
      }
    } catch (err) {
      setAccionMsg({ ok: false, text: String(err) });
    } finally {
      setRegistrando(false);
    }
  }

  async function handleConsultarEstadoFolder() {
    if (!data?.documento || !data.numero) return;
    setEnviandoSII(true);
    setAccionMsg(null);
    try {
      const res = await fetchWithInstance("/api/documento/enviar-sii", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: data.numero,
          tipo: data.documento.tipo,
          empresa: data.documento.codEmpresa,
        }),
      }, instance);
      const json = await res.json();

      const mensaje = json.mensaje ?? json.data?.Mensaje ?? json.error ?? "Error al consultar estado.";
      const ok = json.ok === true;
      setAccionMsg({
        ok,
        text: mensaje,
      });

      if (ok && data.numero) {
        await refreshDocumento(data.numero, {
          tipo: data.documento.tipo,
          empresa: data.documento.codEmpresa,
        });
      }
    } catch (err) {
      setAccionMsg({ ok: false, text: String(err) });
    } finally {
      setEnviandoSII(false);
    }
  }

  const estadoChip = (estado: number | null | undefined) => {
    if (estado === 0) return "bg-slate-200 text-slate-900";
    if (estado === 1) return "bg-amber-500 text-white";
    if (estado === 2 || estado === 3) return "bg-emerald-600 text-white";
    if (estado === 4) return "bg-indigo-600 text-white";
    return "bg-slate-300 text-slate-900";
  };

  const estadoTexto: Record<number, string> = {
    0: "Sin enviar",
    1: "Enviada",
    2: "Localización OK",
    3: "Registrado",
    4: "Medio de pago listo",
  };

  const estadoLabel = (e: number | null) =>
    e != null ? estadoTexto[e] ?? e : "—";

  const getLineasSyncState = (doc: Documento) => {
    const total = Math.max(0, doc.lineasGestion ?? 0);
    const syncedRaw = Math.max(0, doc.lineasDynamicsOk ?? 0);
    const synced = Math.min(total, syncedRaw);
    const hasLineas = total > 0;
    const isComplete = hasLineas && synced >= total;
    const progress = hasLineas ? `${Math.round((synced / total) * 100)}%` : "0%";
    return { total, synced, hasLineas, isComplete, progress };
  };

  const lineasSyncState = data?.documento ? getLineasSyncState(data.documento) : null;

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="relative group mb-8">
        <div className="flex flex-col gap-3 bg-white p-3 border border-zinc-200 rounded-[2rem] shadow-sm hover:shadow-md transition-all">

          {/* Fila Superior: Input Principal */}
          <div className="relative flex items-center bg-zinc-50 rounded-2xl px-5 py-3 border border-transparent focus-within:border-indigo-200 focus-within:bg-zinc-50/50 transition-colors">
            <FileSearch className="h-6 w-6 text-indigo-400 mr-4 shrink-0" />
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Ingrese número de folio (ej: 6512585)"
              className="w-full bg-transparent border-none focus:outline-none text-zinc-900 placeholder:text-zinc-400 text-lg sm:text-xl font-medium"
              aria-label="Número de documento"
            />
          </div>

          {/* Fila Inferior: Selectores y Botón */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 bg-zinc-50 rounded-2xl px-5 py-2 border border-zinc-100 focus-within:border-indigo-200 focus-within:bg-zinc-50/50 transition-colors relative">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Entidad</label>
              <select
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                className="w-full bg-transparent border-none focus:outline-none text-sm font-medium text-zinc-700 cursor-pointer appearance-none outline-none relative z-10"
                disabled={loadingEmpresas}
              >
                <option value="">Todas las Entidades</option>
                {empresas.map((emp) => (
                  <option key={emp.codEmpresa} value={emp.codEmpresa}>
                    {emp.descripcion}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 bg-zinc-50 rounded-2xl px-5 py-2 border border-zinc-100 focus-within:border-indigo-200 focus-within:bg-zinc-50/50 transition-colors relative">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Tipo Doc</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full bg-transparent border-none focus:outline-none text-sm font-medium text-zinc-700 cursor-pointer appearance-none outline-none relative z-10"
              >
                <option value="">Todos los Tipos</option>
                <option value="BLE">Boleta (BLE)</option>
                <option value="FCV">Factura (FCV)</option>
                <option value="NCV">Nota de Crédito (NCV)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="shrink-0 h-full min-h-[56px] px-8 bg-zinc-900 text-white font-semibold rounded-2xl hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm hover:shadow-indigo-500/20"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Consultar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {data && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="mt-10 space-y-6"
          id="documento-reporte"
        >
          {/* Header de Resultado con Acciones Rápidas */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-1 bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-md">
                  {data.documento?.tipo || "DOC"}
                </span>
                <h2 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                  Folio {data.numero}
                </h2>
              </div>
              <p className="text-zinc-500 text-sm">
                Emitido el {data.documento ? formatDateLocal(data.documento.fechaEmision).split(',')[0] : "—"}
              </p>
            </div>

            {data.documento && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => triggerPrint("#documento-reporte")}
                  className="p-2.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors border border-zinc-200 shadow-sm"
                  title="Imprimir Informe"
                >
                  <Printer className="w-4.5 h-4.5" />
                </button>
                <div className="h-8 w-px bg-zinc-200 mx-1" />
                <button
                  type="button"
                  onClick={async () => {
                    const doc = data.documento!;
                    const headers = ["Campo", "Valor"];
                    const rows = [
                      ["Tipo", doc.tipo],
                      ["Número", String(doc.numero)],
                      ["Diagnóstico", data.diagnostico ?? ""],
                    ];
                    await downloadXlsxTable({
                      filename: `doc-${data.numero}`,
                      sheetName: "Documento",
                      headers,
                      rows,
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 text-sm font-semibold rounded-xl hover:bg-zinc-50 transition-all shadow-sm"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Excel
                </button>
              </div>
            )}
          </div>

          {/* Panel de Diagnóstico Inteligente */}
          <div className={`relative overflow-hidden rounded-3xl border p-5 ${data.error
            ? "bg-rose-50/50 border-rose-200 text-rose-900"
            : "bg-indigo-50/50 border-indigo-100 text-indigo-900"
            }`}>
            <div className="flex gap-4">
              <div className={`p-3 rounded-2xl h-fit ${data.error ? "bg-rose-100/50" : "bg-indigo-100/50"}`}>
                {data.error ? <AlertCircle className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-base mb-1">
                  {data.error ? "Incidencia Detectada" : "Diagnóstico del Sistema"}
                </h4>
                <p className="text-sm leading-relaxed opacity-90">
                  {data.diagnostico}
                </p>
                {data.error && (
                  <div className="mt-3 p-3 bg-white/50 rounded-xl border border-rose-200/50">
                    <pre className="text-[11px] font-mono overflow-x-auto whitespace-pre-wrap leading-tight">
                      {data.error}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Panel de Desambiguación */}
          {data.documentosPosibles && data.documentosPosibles.length > 1 && !data.documento && !loading && (
            <div className="mb-6 p-6 border border-indigo-100 bg-indigo-50/50 rounded-3xl shadow-sm">
              <h3 className="text-indigo-900 font-bold mb-2 text-lg flex items-center gap-2">
                <FileSearch className="w-5 h-5" />
                Se encontraron múltiples documentos
              </h3>
              <p className="text-indigo-800 text-sm mb-5 opacity-90">
                La búsqueda arrojó {data.documentosPosibles.length} resultados para el folio {data.numero}.
                Por favor, selecciona la Entidad y Tipo de Documento correspondiente:
              </p>
              <div className="space-y-3">
                {data.documentosPosibles.map((doc, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setLoading(true);
                      const numeroSeleccionado = String(doc.numero);
                      setNumero(numeroSeleccionado);
                      saveNumero(numeroSeleccionado);
                      setTipo(doc.tipo);
                      setEmpresa(doc.codEmpresa);
                      refreshDocumento(numeroSeleccionado, { tipo: doc.tipo, empresa: doc.codEmpresa })
                        .catch((err) => {
                          console.error(err);
                        })
                        .finally(() => setLoading(false));
                    }}
                    className="w-full text-left p-4 rounded-2xl border border-white bg-white hover:border-indigo-400 hover:shadow-md transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner border border-indigo-100/50 content-box">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2.5 py-1 bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-md">
                            {doc.tipo}
                          </span>
                          <span className="font-bold text-zinc-900 text-base">
                            Folio {doc.numero}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 font-medium">
                          <span>Entidad: <span className="font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">{doc.codEmpresa}</span></span>
                          <span>•</span>
                          <span>Emitido: {doc.fechaEmision.split("T")[0]}</span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-zinc-300 group-hover:text-indigo-600 transition-colors transform group-hover:translate-x-1" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Timeline de Ciclo de Vida */}
          {data.documento && (
            <div className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-8 px-2">
                Ciclo de Vida del Documento
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 relative items-start">
                {/* Paso 1: SII */}
                <div className="relative z-10 flex flex-col items-center text-center group/step">
                  <div className={`w-14 h-14 rounded-3xl flex items-center justify-center shadow-lg transition-all duration-500 mb-4 bg-white border-4 ${data.documento.estadoSII === 2 ? "border-emerald-500 text-emerald-500" : "border-zinc-100 text-zinc-300"
                    }`}>
                    <Globe className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-bold text-zinc-900 text-xs md:text-sm">Validación SII</h5>
                    <div className={`text-[10px] font-black uppercase tracking-tight px-2 py-0.5 rounded-full inline-block ${data.documento.estadoSII === 2 ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"
                      }`}>
                      {data.documento.estadoSII === 2 ? "Timbrado OK" : "Pendiente/Error"}
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-zinc-50/50 rounded-2xl text-[11px] text-zinc-500 border border-zinc-100/50 w-full leading-relaxed">
                    Verificado ante el SII.
                  </div>
                </div>

                {/* Conector 1 */}
                <div className="hidden md:block absolute top-[28px] left-[16.66%] w-[33.33%] h-[2px] bg-zinc-100 -z-0">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: data.documento.estadoEnvio != null && data.documento.estadoEnvio > 0 ? "100%" : "0%" }}
                    className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                  />
                </div>

                {/* Paso 2: Dynamics */}
                <div className="relative z-10 flex flex-col items-center text-center group/step">
                  <div className={`w-14 h-14 rounded-3xl flex items-center justify-center shadow-lg transition-all duration-500 mb-4 bg-white border-4 ${data.documento.estadoEnvio != null && data.documento.estadoEnvio >= 1 ? "border-indigo-500 text-indigo-500" : "border-zinc-100 text-zinc-300"
                    }`}>
                    <Database className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-bold text-zinc-900 text-xs md:text-sm">Dynamics ERP</h5>
                    <div className={`text-[10px] font-black uppercase tracking-tight px-2 py-0.5 rounded-full inline-block ${data.documento.estadoEnvio != null && data.documento.estadoEnvio >= 1 ? "bg-indigo-50 text-indigo-600" : "bg-zinc-100 text-zinc-400"
                      }`}>
                      {estadoLabel(data.documento.estadoEnvio)}
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-zinc-50/50 rounded-2xl text-[11px] text-zinc-500 border border-zinc-100/50 w-full leading-relaxed">
                    {data.documento.idDocumentoDynamics ? (
                      <span className="font-mono text-[9px] break-all">{data.documento.idDocumentoDynamics}</span>
                    ) : "Sincronización central."}
                  </div>
                </div>

                {/* Conector 2 */}
                <div className="hidden md:block absolute top-[28px] left-[50%] w-[33.33%] h-[2px] bg-zinc-100 -z-0">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: lineasSyncState?.progress ?? "0%" }}
                    className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                  />
                </div>

                {/* Paso 3: Gestión */}
                <div className="relative z-10 flex flex-col items-center text-center group/step">
                  <div className={`w-14 h-14 rounded-3xl flex items-center justify-center shadow-lg transition-all duration-500 mb-4 bg-white border-4 ${!lineasSyncState?.hasLineas
                    ? "border-zinc-100 text-zinc-300"
                    : lineasSyncState.isComplete
                      ? "border-emerald-500 text-emerald-500"
                      : "border-amber-500 text-amber-500"
                    }`}>
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-bold text-zinc-900 text-xs md:text-sm">Visibilidad Gestión</h5>
                    <div className={`text-[10px] font-black uppercase tracking-tight px-2 py-0.5 rounded-full inline-block ${!lineasSyncState?.hasLineas
                      ? "bg-zinc-100 text-zinc-400"
                      : lineasSyncState.isComplete
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                      }`}>
                      {!lineasSyncState?.hasLineas
                        ? "Sin líneas"
                        : lineasSyncState.isComplete
                          ? `${lineasSyncState.total}/${lineasSyncState.synced} Completo`
                          : `${lineasSyncState.total}/${lineasSyncState.synced} Incompleto`}
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-zinc-50/50 rounded-2xl text-[11px] text-zinc-500 border border-zinc-100/50 w-full leading-relaxed">
                    Validación por línea (Total/Sync Dynamics).
                  </div>
                </div>
              </div>

              {/* Detalle de Líneas - Modernizado */}
              <div className="mt-10 pt-8 border-t border-zinc-100">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-indigo-500" />
                    Desglose Operacional por Línea
                  </h4>
                </div>
                <div className="rounded-2xl border border-zinc-100 overflow-hidden shadow-sm">
                  <DetalleLineas
                    idDocumento={data.documento.idDocumento}
                    tipo={data.documento.tipo}
                  />
                </div>
              </div>

              {/* Acciones de Reproceso Premium */}
              <div className="mt-10 p-6 bg-zinc-900 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                <div className="flex items-center gap-5 relative z-10 mb-6 border-b border-white/5 pb-4">
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/5 shadow-inner">
                    <RefreshCw className={`w-6 h-6 text-white ${reprocesando || enviandoSII ? "animate-spin" : ""}`} />
                  </div>
                  <div>
                    <p className="text-white font-bold text-base">Acciones Operativas</p>
                    <p className="text-white/40 text-[11px]">Gestión manual del flujo y sincronización del documento.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
                  <button
                    type="button"
                    onClick={handleConsultarEstadoFolder}
                    disabled={enviandoSII || !data.documento}
                    className="h-11 px-4 bg-amber-600 text-white text-[12px] font-bold rounded-xl hover:bg-amber-500 transition-all shadow-lg active:scale-95 disabled:opacity-20 flex items-center justify-center gap-2"
                  >
                    <Search className={`w-3.5 h-3.5 ${enviandoSII ? "animate-spin" : ""}`} />
                    {enviandoSII ? "Espere..." : "Folder"}
                  </button>
                  <button
                    type="button"
                    onClick={handleReprocesar}
                    disabled={reprocesando || data.documento.estadoSII !== 2}
                    className="h-11 px-4 bg-indigo-600 text-white text-[12px] font-bold rounded-xl hover:bg-indigo-500 transition-all shadow-lg active:scale-95 disabled:opacity-20 flex items-center justify-center gap-2"
                  >
                    {reprocesando ? "..." : "Reprocesar"}
                  </button>
                  <button
                    type="button"
                    onClick={handleLocalizar}
                    disabled={localizando || !data.documento}
                    className="h-11 px-4 bg-white/10 text-white text-[12px] font-bold rounded-xl hover:bg-white/20 transition-all border border-white/5 active:scale-95 disabled:opacity-20 flex items-center justify-center gap-2"
                  >
                    {localizando ? "..." : "Localizar"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRegistrar}
                    disabled={registrando || !data.documento}
                    className="h-11 px-4 bg-emerald-600 text-white text-[12px] font-bold rounded-xl hover:bg-emerald-500 transition-all shadow-lg active:scale-95 disabled:opacity-20 flex items-center justify-center gap-2"
                  >
                    {registrando ? "..." : "Registrar"}
                  </button>
                </div>

              </div>

              {(reprocesoMsg || accionMsg) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-6 rounded-2xl p-5 text-sm font-bold flex items-center gap-3 border shadow-sm ${(reprocesoMsg ?? accionMsg)?.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-rose-200 bg-rose-50 text-rose-900"
                    }`}
                >
                  {(reprocesoMsg ?? accionMsg)?.ok ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6 text-rose-500" />}
                  {(reprocesoMsg ?? accionMsg)?.text}
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {data && (data.ultimoLog != null || data.errores.length > 0) && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Errores registrados</h3>
          {data.ultimoLog != null && (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Último log Dynamics</p>
              <p className="mt-1 font-medium text-slate-900">
                Estado: {estadoLabel(data.ultimoLog.estado)}
                {data.ultimoLog.fecha && (
                  <span className="ml-2 text-slate-700">
                    — {data.ultimoLog.fecha.slice(0, 19).replace("T", " ")}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Si hay errores abajo, compruebe si el documento ya está bien según este estado.
              </p>
            </div>
          )}
          {data.errores.length > 0 ? (
            <ul className="space-y-2">
              {data.errores.map((err, i) => (
                <li key={i} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
                  <span className="text-rose-900 font-semibold">{err.mensaje}</span>
                  <span className="text-rose-800 block mt-1">{err.fecha}</span>
                  {err.error && (
                    <pre className="mt-2 text-xs overflow-auto max-h-24 text-rose-900">{err.error}</pre>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No hay errores registrados para este documento.</p>
          )}
        </div>
      )}
    </div>
  );
}
