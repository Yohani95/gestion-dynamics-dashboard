"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Upload, Download, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { downloadXlsxTable } from "@/lib/exportUtils";
import {
  readExcelFile,
  REPROCESO_EXCEL_TEMPLATE_HEADERS,
  REPROCESO_EXCEL_TEMPLATE_ROWS,
  REPROCESO_MASIVO_LOTE,
  type ExcelFilaParsed,
} from "@/lib/reprocesoMasivoExcel";
import { useInstance, fetchWithInstance } from "./InstanceContext";
import { useAdminSession } from "./AdminSessionContext";

type ResultadoFila = {
  ok?: boolean;
  rut?: string;
  numero?: string;
  tipo?: string;
  mensaje?: string;
  error?: string;
};

export type ReprocesoExcelEstado = {
  procesando: boolean;
  archivoNombre: string | null;
  loteActual: number;
  totalLotes: number;
  filasProcesadas: number;
  totalFilas: number;
  resultado: { ok: boolean; text: string } | null;
};

type Props = {
  onEstadoChange?: (estado: ReprocesoExcelEstado) => void;
};

export default function ReprocesoMasivoExcel({ onEstadoChange }: Props) {
  const { instance } = useInstance();
  const { isAdmin, loading: sessionLoading } = useAdminSession();
  const inputRef = useRef<HTMLInputElement>(null);

  const [filas, setFilas] = useState<ExcelFilaParsed[]>([]);
  const [parseErrores, setParseErrores] = useState<string[]>([]);
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [loteActual, setLoteActual] = useState(0);
  const [totalLotes, setTotalLotes] = useState(0);
  const [filasProcesadas, setFilasProcesadas] = useState(0);
  const [resultado, setResultado] = useState<{
    ok: boolean;
    text: string;
    fallos?: { numero: string; tipo: string; detalle: string }[];
  } | null>(null);

  useEffect(() => {
    onEstadoChange?.({
      procesando,
      archivoNombre,
      loteActual,
      totalLotes,
      filasProcesadas,
      totalFilas: filas.length,
      resultado: resultado ? { ok: resultado.ok, text: resultado.text } : null,
    });
  }, [
    archivoNombre,
    filas.length,
    filasProcesadas,
    loteActual,
    onEstadoChange,
    procesando,
    resultado,
    totalLotes,
  ]);

  async function handleDescargarPlantilla() {
    await downloadXlsxTable({
      filename: "plantilla_reproceso_masivo",
      sheetName: "Reproceso",
      headers: REPROCESO_EXCEL_TEMPLATE_HEADERS,
      rows: REPROCESO_EXCEL_TEMPLATE_ROWS,
    });
  }

  async function handleArchivoSeleccionado(file: File | null) {
    setResultado(null);
    if (!file) return;

    setArchivoNombre(file.name);
    try {
      const parsed = await readExcelFile(file);
      setFilas(parsed.filas);
      setParseErrores(parsed.errores);
    } catch (e) {
      setFilas([]);
      setParseErrores([String(e)]);
    }
  }

  async function ejecutarLote(lote: ExcelFilaParsed[]) {
    const res = await fetchWithInstance(
      "/api/documento/reprocesar-excel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filas: lote.map((f) => ({
            rut: f.rut,
            numero: f.numero,
            tipo: f.tipo,
            fila: f.fila,
          })),
        }),
      },
      instance,
    );
    return res.json();
  }

  async function handleReprocesar() {
    if (!filas.length) return;

    const lotes = Math.ceil(filas.length / REPROCESO_MASIVO_LOTE);
    const msgLotes =
      lotes > 1
        ? ` Se procesaran ${lotes} lotes de hasta ${REPROCESO_MASIVO_LOTE} filas.`
        : "";

    if (
      !window.confirm(
        `Reprocesar ${filas.length} documento(s) desde Excel hacia Dynamics.${msgLotes} ¿Continuar?`,
      )
    ) {
      return;
    }

    const lotesTotal = Math.ceil(filas.length / REPROCESO_MASIVO_LOTE);
    setProcesando(true);
    setResultado(null);
    setLoteActual(0);
    setTotalLotes(lotesTotal);
    setFilasProcesadas(0);

    let total = 0;
    let exitosos = 0;
    let fallidos = 0;
    const fallos: { numero: string; tipo: string; detalle: string }[] = [];

    try {
      for (let i = 0; i < filas.length; i += REPROCESO_MASIVO_LOTE) {
        const lote = filas.slice(i, i + REPROCESO_MASIVO_LOTE);
        setLoteActual(Math.floor(i / REPROCESO_MASIVO_LOTE) + 1);
        const json = await ejecutarLote(lote);

        if (!json.masivo || !Array.isArray(json.resultados)) {
          setResultado({
            ok: false,
            text: json.error ?? "Respuesta inesperada del servidor.",
          });
          return;
        }

        total += json.total ?? 0;
        exitosos += json.exitosos ?? 0;
        fallidos += json.fallidos ?? 0;

        for (const r of json.resultados as ResultadoFila[]) {
          if (r.ok) continue;
          fallos.push({
            numero: String(r.numero ?? ""),
            tipo: String(r.tipo ?? ""),
            detalle: r.error ?? r.mensaje ?? "Error",
          });
        }

        setFilasProcesadas(Math.min(i + lote.length, filas.length));
      }

      setResultado({
        ok: fallidos === 0,
        text: `Excel: ${total} filas procesadas. Exitosos: ${exitosos}. Fallidos: ${fallidos}.`,
        fallos: fallos.length ? fallos : undefined,
      });
    } catch (e) {
      setResultado({ ok: false, text: String(e) });
    } finally {
      setProcesando(false);
    }
  }

  function limpiar() {
    setFilas([]);
    setParseErrores([]);
    setArchivoNombre(null);
    setResultado(null);
    setLoteActual(0);
    setTotalLotes(0);
    setFilasProcesadas(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-8">
      <div className="rounded-3xl border border-zinc-200/70 bg-zinc-50/60 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              Reproceso masivo desde Excel
            </h3>
            <p className="mt-2 text-sm text-zinc-500 max-w-2xl leading-relaxed">
              Suba un archivo con columnas <strong>Rut Empresa</strong>, <strong>Nro Folio</strong> y{" "}
              <strong>Tipo Folio</strong> (BLE, FCV, NCV). El sistema busca cada documento y lo
              reprocesa hacia Dynamics.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDescargarPlantilla}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <Download className="w-4 h-4" />
            Plantilla Excel
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-white px-4 py-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-50/40">
            <Upload className="w-4 h-4" />
            {archivoNombre ? archivoNombre : "Seleccionar archivo .xlsx / .xls"}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleArchivoSeleccionado(e.target.files?.[0] ?? null)}
            />
          </label>
          {filas.length > 0 && (
            <button
              type="button"
              onClick={limpiar}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Limpiar
            </button>
          )}
        </div>

        {!sessionLoading && !isAdmin && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Inicie sesion como administrador para ejecutar el reproceso masivo.
          </p>
        )}

        {parseErrores.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Advertencias al leer el archivo
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {parseErrores.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {procesando && (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
            <p className="font-semibold flex items-center gap-2">
              <RotateCcw className="w-4 h-4 animate-spin" />
              Reprocesando en segundo plano
            </p>
            <p className="mt-1">
              Lote {loteActual} de {totalLotes} · {filasProcesadas} de {filas.length} filas
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                style={{
                  width: `${filas.length ? Math.round((filasProcesadas / filas.length) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {filas.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-zinc-800">
                {filas.length} fila(s) lista(s) para reprocesar
                {filas.length > REPROCESO_MASIVO_LOTE
                  ? ` (${Math.ceil(filas.length / REPROCESO_MASIVO_LOTE)} lotes)`
                  : ""}
              </p>
              <button
                type="button"
                onClick={handleReprocesar}
                disabled={procesando || !isAdmin || filas.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <RotateCcw className={`w-4 h-4 ${procesando ? "animate-spin" : ""}`} />
                {procesando ? "Reprocesando..." : "Reprocesar masivo"}
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-zinc-300 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-900 text-left text-xs font-bold uppercase tracking-wide text-white">
                  <tr>
                    <th className="px-4 py-3.5">Fila</th>
                    <th className="px-4 py-3.5">RUT</th>
                    <th className="px-4 py-3.5">Folio</th>
                    <th className="px-4 py-3.5">Tipo</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-900">
                  {filas.slice(0, 100).map((fila, index) => (
                    <tr
                      key={`${fila.fila}-${fila.rut}-${fila.numero}-${fila.tipo}`}
                      className={`border-t border-zinc-200 ${index % 2 === 0 ? "bg-white" : "bg-zinc-50"}`}
                    >
                      <td className="px-4 py-3 tabular-nums font-semibold">{fila.fila}</td>
                      <td className="px-4 py-3 font-medium">{fila.rut}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold">{fila.numero}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-900">
                          {fila.tipo}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filas.length > 100 && (
                <p className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-medium text-zinc-700">
                  Mostrando las primeras 100 filas de {filas.length}.
                </p>
              )}
            </div>
          </div>
        )}

        {resultado && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              resultado.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            <p className="font-semibold flex items-center gap-2">
              {resultado.ok ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              Resultado reproceso Excel
            </p>
            <p className="mt-1">{resultado.text}</p>
            {resultado.fallos && resultado.fallos.length > 0 && (
              <ul className="mt-3 max-h-48 overflow-y-auto space-y-1 text-xs">
                {resultado.fallos.map((f, i) => (
                  <li key={`${f.tipo}-${f.numero}-${i}`}>
                    <strong>
                      {f.tipo} #{f.numero}
                    </strong>
                    : {f.detalle}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
