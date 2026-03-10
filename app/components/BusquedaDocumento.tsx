"use client";

import { useState, useEffect } from "react";
import DetalleLineas from "./DetalleLineas";
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
  } catch {}
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
  } catch {}
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

export default function BusquedaDocumento({ numeroParaCargar, onNumeroCargado }: BusquedaDocumentoProps) {
  const [numero, setNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [reprocesando, setReprocesando] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [reprocesoMsg, setReprocesoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [accionMsg, setAccionMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    fetch(`/api/documento?numero=${encodeURIComponent(n)}`)
      .then((res) => res.json())
      .then((json: ApiResponse) => {
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
  }, [numeroParaCargar, onNumeroCargado]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = numero.trim();
    if (!n) return;
    saveNumero(n);
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`/api/documento?numero=${encodeURIComponent(n)}`);
      const json: ApiResponse = await res.json();
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
    try {
      const res = await fetch("/api/documento/reprocesar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: data.numero }),
      });
      const json = await res.json();
      setReprocesoMsg({
        ok: json.ok === true,
        text: json.mensaje ?? json.error ?? (res.ok ? "Reproceso ejecutado." : "Error al reprocesar."),
      });
      if (json.ok && data.numero) {
        const r = await fetch(`/api/documento?numero=${encodeURIComponent(data.numero)}`);
        const updated = await r.json();
        setData(updated);
        saveResult(updated);
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
      const res = await fetch("/api/documento/localizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: data.numero }),
      });
      const json = await res.json();
      setAccionMsg({
        ok: json.ok === true,
        text: json.mensaje ?? json.error ?? (res.ok ? "Localización ejecutada." : "Error al localizar."),
      });
      if (json.ok && data.numero) {
        const r = await fetch(`/api/documento?numero=${encodeURIComponent(data.numero)}`);
        const updated = await r.json();
        setData(updated);
        saveResult(updated);
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
      const res = await fetch("/api/documento/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: data.numero }),
      });
      const json = await res.json();
      setAccionMsg({
        ok: json.ok === true,
        text: json.mensaje ?? json.error ?? (res.ok ? "Registro ejecutado." : "Error al registrar."),
      });
      if (json.ok && data.numero) {
        const r = await fetch(`/api/documento?numero=${encodeURIComponent(data.numero)}`);
        const updated = await r.json();
        setData(updated);
        saveResult(updated);
      }
    } catch (err) {
      setAccionMsg({ ok: false, text: String(err) });
    } finally {
      setRegistrando(false);
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

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Número de documento (ej: 6512585)"
          className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
          aria-label="Número de documento"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-6 py-3 font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Buscando…" : "Consultar"}
        </button>
      </form>

      {data && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" id="documento-reporte">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Resultado para {data.numero}
            </h2>
            {data.documento && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const doc = data.documento!;
                    const headers = ["Campo", "Valor"];
                    const rows = [
                      ["Tipo", doc.tipo],
                      ["Número", String(doc.numero)],
                      ["Estado SII", doc.estadoSII === 2 ? "Timbrado" : doc.estadoSII === 1 ? "Sin timbrar" : "—"],
                      ["Estado Dynamics", doc.estadoEnvio != null ? (estadoTexto[doc.estadoEnvio] ?? String(doc.estadoEnvio)) : "—"],
                      ["Líneas Gestion", String(doc.lineasGestion ?? "")],
                      ["Fecha emisión", doc.fechaEmision ?? ""],
                      ["Id Dynamics", doc.idDocumentoDynamics ?? ""],
                      ["Diagnóstico", data.diagnostico ?? ""],
                    ];
                    const csv = rowsToCsv(headers, rows);
                    downloadCsv(`documento-${data.numero}.csv`, csv);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Exportar CSV
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const doc = data.documento!;
                    const headers = ["Campo", "Valor"];
                    const rows = [
                      ["Tipo", doc.tipo],
                      ["Número", doc.numero],
                      ["Estado SII", doc.estadoSII === 2 ? "Timbrado" : doc.estadoSII === 1 ? "Sin timbrar" : "—"],
                      ["Estado Dynamics", doc.estadoEnvio != null ? (estadoTexto[doc.estadoEnvio] ?? String(doc.estadoEnvio)) : "—"],
                      ["Líneas Gestion", doc.lineasGestion ?? ""],
                      ["Fecha emisión", doc.fechaEmision ?? ""],
                      ["Id Dynamics", doc.idDocumentoDynamics ?? ""],
                      ["Diagnóstico", data.diagnostico ?? ""],
                    ];
                    await downloadXlsxTable({
                      filename: `documento-${data.numero}`,
                      sheetName: "Documento",
                      headers,
                      rows,
                    });
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Exportar Excel
                </button>
                <button
                  type="button"
                  onClick={() => triggerPrint("#documento-reporte")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Imprimir
                </button>
              </div>
            )}
          </div>

          {data.error && (
            <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-4">
              <p className="font-semibold text-rose-900">Error</p>
              <p className="mt-1 text-sm text-rose-800">{data.error}</p>
              {data.stack && (
                <pre className="mt-2 overflow-auto max-h-40 text-xs text-rose-900 whitespace-pre-wrap">{data.stack}</pre>
              )}
            </div>
          )}

          <div className="rounded-lg bg-amber-50 border border-amber-300 p-4 mb-4">
            <p className="text-sm font-semibold text-amber-900">Diagnóstico</p>
            <p className="mt-1 text-sm text-amber-900">{data.diagnostico}</p>
          </div>

          {data.documento && (
            <>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-600 font-medium">Tipo</dt>
                <dd>
                  <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold uppercase text-white">
                    {data.documento.tipo}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-600 font-medium">Número</dt>
                <dd className="font-mono font-semibold text-slate-900">{data.documento.numero}</dd>
              </div>
              <div>
                <dt className="text-slate-600 font-medium">Estado SII</dt>
                <dd>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${data.documento.estadoSII === 2 ? "bg-emerald-600 text-white" : data.documento.estadoSII === 1 ? "bg-amber-500 text-white" : "bg-slate-300 text-slate-900"}`}>
                    {data.documento.estadoSII === 2 ? "Timbrado" : data.documento.estadoSII === 1 ? "Sin timbrar" : "—"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-600 font-medium">Estado Dynamics</dt>
                <dd>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoChip(data.documento.estadoEnvio)}`}>
                    {data.documento.estadoEnvio != null
                      ? estadoTexto[data.documento.estadoEnvio] ?? data.documento.estadoEnvio
                      : "—"}
                  </span>
                </dd>
              </div>
              {typeof data.documento.lineasGestion === "number" && (
                <div>
                  <dt className="text-slate-600 font-medium">Líneas en Gestion</dt>
                  <dd className="font-semibold text-slate-900">{data.documento.lineasGestion}</dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-slate-600 font-medium">Fecha emisión</dt>
                <dd className="text-slate-900">{data.documento.fechaEmision}</dd>
              </div>
              {data.documento.idDocumentoDynamics && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">Id Dynamics</dt>
                  <dd className="font-mono text-xs break-all text-slate-900">{data.documento.idDocumentoDynamics}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                Detalle por línea
              </h3>
              <DetalleLineas
                idDocumento={data.documento.idDocumento}
                tipo={data.documento.tipo}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleReprocesar}
                disabled={reprocesando || data.documento.estadoSII !== 2}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                {reprocesando ? "…" : "Reprocesar"}
              </button>
              <button
                type="button"
                onClick={handleLocalizar}
                disabled={localizando || !data.documento}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                {localizando ? "Localizando…" : "Localizar"}
              </button>
              <button
                type="button"
                onClick={handleRegistrar}
                disabled={registrando || !data.documento}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                {registrando ? "Registrando…" : "Registrar"}
              </button>
              {data.documento.estadoSII !== 2 && (
                <span className="text-xs text-slate-500">Reprocesar solo si está timbrado (SII).</span>
              )}
            </div>
            {(reprocesoMsg || accionMsg) && (
              <div className={`mt-3 rounded-lg border p-3 text-sm font-medium ${(reprocesoMsg ?? accionMsg)?.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-rose-300 bg-rose-50 text-rose-900"}`}>
                {(reprocesoMsg ?? accionMsg)?.text}
              </div>
            )}
            </>
          )}

          {(data.ultimoLog != null || data.errores.length > 0) && (
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
      )}
    </div>
  );
}
