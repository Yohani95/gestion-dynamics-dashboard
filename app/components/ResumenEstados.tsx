"use client";

import { useState, useEffect } from "react";
import { rowsToCsv, downloadCsv, downloadXlsxTable, triggerPrint } from "@/lib/exportUtils";

const RESUMEN_STORAGE_KEY = "gestion-dash-resumen";

type ResumenPersisted = {
  fechaDesde: string;
  fechaHasta: string;
  empresa: string;
  estados: number[];
  resumen?: ResumenItem[];
};

function loadResumenPersisted(): ResumenPersisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RESUMEN_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ResumenPersisted>;
    return {
      fechaDesde: p.fechaDesde ?? "",
      fechaHasta: p.fechaHasta ?? "",
      empresa: p.empresa ?? "",
      estados: Array.isArray(p.estados) ? p.estados : [0, 1, 2, 3, 4],
      resumen: Array.isArray(p.resumen) ? p.resumen : undefined,
    };
  } catch {
    return null;
  }
}

function saveResumenPersisted(p: ResumenPersisted) {
  try {
    sessionStorage.setItem(RESUMEN_STORAGE_KEY, JSON.stringify(p));
  } catch {}
}

type ResumenItem = {
  descripcion: string;
  fecha: string;
  codEmpresa: string;
  tipo: string;
  estado: number;
  cantidad: number;
};

type Empresa = { codEmpresa: string; descripcion: string };

const ESTADOS: { valor: number; etiqueta: string }[] = [
  { valor: 0, etiqueta: "Sin enviar" },
  { valor: 1, etiqueta: "Enviada" },
  { valor: 2, etiqueta: "Loc. OK" },
  { valor: 3, etiqueta: "Registrado" },
  { valor: 4, etiqueta: "Medio de pago listo" },
];

export default function ResumenEstados() {
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [estados, setEstados] = useState<number[]>([0, 1, 2, 3, 4]);
  const [empresa, setEmpresa] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [resumen, setResumen] = useState<ResumenItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);

  useEffect(() => {
    const p = loadResumenPersisted();
    if (p) {
      setFechaDesde(p.fechaDesde);
      setFechaHasta(p.fechaHasta ?? "");
      setEmpresa(p.empresa);
      setEstados(p.estados);
      if (p.resumen) setResumen(p.resumen);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingEmpresas(true);
    fetch("/api/empresas")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.empresas) setEmpresas(json.empresas);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingEmpresas(false); });
    return () => { cancelled = true; };
  }, []);

  function toggleEstado(valor: number) {
    setEstados((prev) =>
      prev.includes(valor) ? prev.filter((e) => e !== valor) : [...prev, valor].sort((a, b) => a - b)
    );
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    const f = fechaDesde.trim();
    if (!f) return;
    if (estados.length === 0) {
      setError("Marca al menos un estado.");
      return;
    }
    setLoading(true);
    setError(null);
    setResumen(null);
    try {
      const params = new URLSearchParams({
        fechaDesde: f,
        estados: estados.join(","),
      });
      const fHasta = fechaHasta.trim();
      if (fHasta) params.set("fechaHasta", fHasta);
      if (empresa) params.set("empresa", empresa);
      const res = await fetch(`/api/resumen-estados?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al cargar");
        return;
      }
      const resumenData = json.resumen ?? [];
      setResumen(resumenData);
      saveResumenPersisted({ fechaDesde: f, fechaHasta: fHasta, empresa, estados, resumen: resumenData });
    } catch (err) {
      setError(String(err));
      setResumen([]);
    } finally {
      setLoading(false);
    }
  }

  const totalGeneral = resumen?.reduce((s, r) => s + r.cantidad, 0) ?? 0;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      <form onSubmit={handleBuscar} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="resumen-fecha" className="block text-sm font-medium text-zinc-700 mb-1">
                Fecha desde (documentos con fecha &gt;=)
              </label>
              <input
                id="resumen-fecha"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                aria-label="Fecha desde"
              />
            </div>
            <div>
              <label htmlFor="resumen-fecha-hasta" className="block text-sm font-medium text-zinc-700 mb-1" title="Si no se indica, se incluyen todos los días desde la fecha desde">
                Fecha hasta (opcional)
              </label>
              <input
                id="resumen-fecha-hasta"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                aria-label="Fecha hasta (opcional)"
                title="Si se deja vacío, se incluyen todos los días desde la fecha desde"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Estados (marca los que quieras ver)
              </label>
              <div className="flex flex-wrap gap-3">
                {ESTADOS.map(({ valor, etiqueta }) => (
                  <label key={valor} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={estados.includes(valor)}
                      onChange={() => toggleEstado(valor)}
                      className="rounded border-zinc-300 text-zinc-800 focus:ring-zinc-500"
                    />
                    <span className="text-sm text-zinc-700">
                      {valor}: {etiqueta}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="resumen-empresa" className="block text-sm font-medium text-zinc-700 mb-1">
                Empresa
              </label>
              <select
                id="resumen-empresa"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                disabled={loadingEmpresas}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black disabled:opacity-60"
                aria-label="Filtrar por empresa"
              >
                <option value="">Todas</option>
                {empresas.map((e) => (
                  <option key={e.codEmpresa} value={e.codEmpresa}>
                    {e.descripcion}
                  </option>
                ))}
              </select>
            </div>
            <div className="pt-6">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-zinc-800 px-4 py-2.5 font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
              >
                {loading ? "Cargando…" : "Ver resumen"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {resumen && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" id="resumen-reporte">
          <div className="p-3 border-b border-slate-200 bg-slate-900 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-100">
              <strong>Total registros:</strong> {totalGeneral} (agrupado por empresa, fecha, tipo y estado).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const headers = ["Empresa", "Fecha", "Tipo", "Estado", "Etiqueta estado", "Cantidad"];
                  const rows = resumen.map((r) => [
                    r.descripcion,
                    r.fecha,
                    r.tipo,
                    String(r.estado),
                    ESTADOS.find((e) => e.valor === r.estado)?.etiqueta ?? "",
                    String(r.cantidad),
                  ]);
                  const csv = rowsToCsv(headers, rows);
                  const nombre = `resumen-estados-${fechaDesde}${fechaHasta ? `-hasta-${fechaHasta}` : ""}.csv`;
                  downloadCsv(nombre, csv);
                }}
                className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
              >
                Exportar CSV
              </button>
              <button
                type="button"
                onClick={async () => {
                  const headers = ["Empresa", "Fecha", "Tipo", "Estado", "Etiqueta estado", "Cantidad"];
                  const rows = resumen.map((r) => [
                    r.descripcion,
                    r.fecha,
                    r.tipo,
                    r.estado,
                    ESTADOS.find((e) => e.valor === r.estado)?.etiqueta ?? "",
                    r.cantidad,
                  ]);
                  await downloadXlsxTable({
                    filename: `resumen-estados-${fechaDesde}${fechaHasta ? `-hasta-${fechaHasta}` : ""}`,
                    sheetName: "Resumen",
                    headers,
                    rows,
                  });
                }}
                className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
              >
                Exportar Excel
              </button>
              <button
                type="button"
                onClick={() => triggerPrint("#resumen-reporte")}
                className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
              >
                Imprimir
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-900 text-left">
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-slate-100">
                    Empresa
                  </th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-slate-100">
                    Fecha
                  </th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-slate-100">
                    Tipo
                  </th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-slate-100">
                    Estado
                  </th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-right text-slate-100">
                    Cantidad
                  </th>
                </tr>
              </thead>
              <tbody>
                {resumen.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      No hay datos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  resumen.map((r, i) => (
                    <tr
                      key={`${r.codEmpresa}-${r.fecha}-${r.tipo}-${r.estado}-${i}`}
                      className="border-b border-slate-100 even:bg-slate-50 hover:bg-slate-100/70"
                    >
                      <td className="p-3 text-sm font-semibold text-slate-900">
                        {r.descripcion}
                      </td>
                      <td className="p-3 text-sm text-slate-700">{r.fecha}</td>
                      <td className="p-3">
                        <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                          {r.tipo}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-slate-800">
                          {r.estado}: {ESTADOS.find((e) => e.valor === r.estado)?.etiqueta ?? r.estado}
                        </span>
                      </td>
                      <td className="p-3 text-right text-base font-bold tabular-nums text-slate-900">
                        {r.cantidad}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
