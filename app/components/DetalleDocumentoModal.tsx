"use client";

import { useEffect, useState } from "react";
import DetalleLineas from "./DetalleLineas";
import { useInstance, fetchWithInstance, InstanceId } from "./InstanceContext";
import { useAdminSession } from "./AdminSessionContext";

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
  documentosPosibles?: Documento[];
  errores: ErrorItem[];
  ultimoLog?: UltimoLog;
  diagnostico: string;
  error?: string;
};

type DetalleParam = { numero: string | null; tipo?: string; empresa?: string };
type Props = {
  param: DetalleParam;
  onClose: () => void;
};

const estadoChip = (estado: number | null | undefined) => {
  if (estado === 0) return "bg-slate-200 text-slate-900";
  if (estado === 1) return "bg-amber-500 text-white";
  if (estado === 2 || estado === 3) return "bg-emerald-600 text-white";
  if (estado === 4) return "bg-indigo-600 text-white";
  return "bg-slate-300 text-slate-900";
};

const estadoLabel: Record<number, string> = {
  0: "Sin enviar",
  1: "Enviada",
  2: "Localización OK",
  3: "Registrado",
  4: "Medio de pago listo",
};

function loadDocumento(param: DetalleParam, instance: InstanceId) {
  if (!param.numero) return Promise.resolve(null);
  let url = `/api/documento?numero=${encodeURIComponent(param.numero)}`;
  if (param.tipo) url += `&tipo=${encodeURIComponent(param.tipo)}`;
  if (param.empresa) url += `&empresa=${encodeURIComponent(param.empresa)}`;

  return fetchWithInstance(url, {}, instance)
    .then((res) => res.json())
    .then((json: ApiResponse) => json)
    .catch(() => ({
      numero: param.numero!,
      documento: null,
      errores: [],
      diagnostico: "Error al consultar el documento.",
      error: "Error de red",
    }));
}

export default function DetalleDocumentoModal({ param, onClose }: Props) {
  const { instance } = useInstance();
  const { isAdmin } = useAdminSession();
  const numero = param?.numero;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [reprocesando, setReprocesando] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [reprocesoMsg, setReprocesoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [accionMsg, setAccionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!numero) return;
    setLoading(true);
    setData(null);
    setReprocesoMsg(null);
    loadDocumento(param, instance)
      .then(setData)
      .finally(() => setLoading(false));
  }, [param, instance, numero]);

  async function handleReprocesar() {
    if (!numero || !data?.documento || data.documento.estadoSII !== 2) return;
    setReprocesando(true);
    setReprocesoMsg(null);
    setAccionMsg(null);
    try {
      const res = await fetchWithInstance("/api/documento/reprocesar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero,
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
      if (json.ok) {
        const updated = await loadDocumento(
          {
            numero: String(data.documento.numero),
            tipo: data.documento.tipo,
            empresa: data.documento.codEmpresa,
          },
          instance
        );
        setData(updated);
      }
    } catch (err) {
      setReprocesoMsg({ ok: false, text: String(err) });
    } finally {
      setReprocesando(false);
    }
  }

  async function handleLocalizar() {
    if (!numero || !data?.documento) return;
    setLocalizando(true);
    setAccionMsg(null);
    try {
      const res = await fetchWithInstance("/api/documento/localizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero,
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
      if (json.ok) {
        const updated = await loadDocumento(
          {
            numero: String(data.documento.numero),
            tipo: data.documento.tipo,
            empresa: data.documento.codEmpresa,
          },
          instance
        );
        setData(updated);
      }
    } catch (err) {
      setAccionMsg({ ok: false, text: String(err) });
    } finally {
      setLocalizando(false);
    }
  }

  async function handleRegistrar() {
    if (!numero || !data?.documento) return;
    setRegistrando(true);
    setAccionMsg(null);
    try {
      const res = await fetchWithInstance("/api/documento/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero,
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
      if (json.ok) {
        const updated = await loadDocumento(
          {
            numero: String(data.documento.numero),
            tipo: data.documento.tipo,
            empresa: data.documento.codEmpresa,
          },
          instance
        );
        setData(updated);
      }
    } catch (err) {
      setAccionMsg({ ok: false, text: String(err) });
    } finally {
      setRegistrando(false);
    }
  }

  if (!numero) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Detalle documento {numero}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-6 py-4">
          {loading && (
            <p className="text-sm text-slate-600">Cargando detalle…</p>
          )}

          {!loading && data && (
            <>
              {data.error && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  {data.error}
                </div>
              )}

              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Diagnóstico
                </p>
                <p className="mt-1 text-sm text-amber-900">{data.diagnostico}</p>
              </div>

              {data?.documentosPosibles && data.documentosPosibles.length > 1 && !data.documento && !loading && (
                <div className="mb-6 p-5 border border-amber-200 bg-amber-50 rounded-xl shadow-sm">
                  <h3 className="text-amber-900 font-bold mb-2 text-lg">Se encontraron múltiples documentos</h3>
                  <p className="text-amber-800 text-sm mb-4">
                    Existen {data.documentosPosibles.length} documentos con el número {numero} en esta instancia.
                    Por favor, selecciona el correcto:
                  </p>
                  <div className="space-y-2">
                    {data.documentosPosibles.map((doc, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setLoading(true);
                          loadDocumento({ numero: String(doc.numero), tipo: doc.tipo, empresa: doc.codEmpresa }, instance)
                            .then(setData)
                            .finally(() => setLoading(false));
                        }}
                        className="w-full rounded-xl border border-white/50 bg-white/60 p-3 text-left hover:bg-white hover:shadow-md hover:border-amber-300 transition-all flex justify-between items-center group"
                      >
                        <div>
                          <div className="font-bold text-amber-900 flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded text-[10px] uppercase tracking-wider">{doc.tipo}</span>
                            Folio {doc.numero}
                          </div>
                          <div className="text-xs text-amber-700 mt-1">
                            Empresa ID: <span className="font-mono">{doc.codEmpresa}</span> | Emisión: {doc.fechaEmision.split("T")[0]}
                          </div>
                        </div>
                        <span className="text-amber-500 font-semibold text-xs group-hover:translate-x-1 transition-transform">Ver Detalle &rarr;</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {data?.documento && !loading && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                        {data.documento.tipo}
                      </span>
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        Nº {data.documento.numero}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${estadoChip(
                          data.documento.estadoSII,
                        )}`}
                      >
                        SII:{" "}
                        {data.documento.estadoSII === 2
                          ? "Timbrado"
                          : data.documento.estadoSII === 1
                            ? "Sin timbrar"
                            : "—"}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${estadoChip(
                          data.documento.estadoEnvio,
                        )}`}
                      >
                        Dynamics:{" "}
                        {data.documento.estadoEnvio != null
                          ? estadoLabel[data.documento.estadoEnvio] ??
                          data.documento.estadoEnvio
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">Empresa</dt>
                      <dd className="font-mono text-slate-900">
                        {data.documento.codEmpresa}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Fecha emisión</dt>
                      <dd className="text-slate-900">
                        {data.documento.fechaEmision}
                      </dd>
                    </div>
                    {typeof data.documento.lineasGestion === "number" && (
                      <div>
                        <dt className="text-slate-500">Líneas en Gestion</dt>
                        <dd className="font-semibold text-slate-900">
                          {data.documento.lineasGestion}
                        </dd>
                      </div>
                    )}
                    {data.documento.idDocumentoDynamics && (
                      <div className="sm:col-span-2">
                        <dt className="text-slate-500">Id Dynamics</dt>
                        <dd className="font-mono text-[11px] leading-snug text-slate-900 break-all">
                          {data.documento.idDocumentoDynamics}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {isAdmin ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleReprocesar}
                        disabled={reprocesando || data.documento.estadoSII !== 2}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {reprocesando ? "…" : "Reprocesar"}
                      </button>
                      <button
                        type="button"
                        onClick={handleLocalizar}
                        disabled={localizando || !data.documento}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        {localizando ? "Localizando…" : "Localizar"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRegistrar}
                        disabled={registrando || !data.documento}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        {registrando ? "Registrando…" : "Registrar"}
                      </button>
                      {data.documento.estadoSII !== 2 && (
                        <span className="text-xs text-slate-500">Reprocesar solo si está timbrado (SII).</span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      Acciones restringidas a administrador.
                    </div>
                  )}
                  {(reprocesoMsg || accionMsg) && (
                    <div
                      className={`mt-2 rounded-lg border p-2 text-sm font-medium ${(reprocesoMsg ?? accionMsg)?.ok
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : "border-rose-300 bg-rose-50 text-rose-900"
                        }`}
                    >
                      {(reprocesoMsg ?? accionMsg)?.text}
                    </div>
                  )}

                  <div className="mt-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Detalle por línea
                    </h3>
                    <DetalleLineas
                      idDocumento={data.documento.idDocumento}
                      tipo={data.documento.tipo}
                    />
                  </div>
                </div>
              )}

              {(data.ultimoLog != null || data.errores.length > 0) && (
                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Errores registrados
                  </h3>
                  {data.ultimoLog != null && (
                    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Último log Dynamics
                      </p>
                      <p className="mt-1 font-medium text-slate-900">
                        Estado:{" "}
                        {data.ultimoLog.estado != null
                          ? estadoLabel[data.ultimoLog.estado] ?? data.ultimoLog.estado
                          : "—"}
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
                        <li
                          key={i}
                          className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900"
                        >
                          <span className="font-semibold">{err.mensaje}</span>
                          <span className="mt-0.5 block text-[11px] text-rose-800">
                            {err.fecha}
                          </span>
                          {err.error && (
                            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-rose-900">
                              {err.error}
                            </pre>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-600">No hay errores registrados para este documento.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

