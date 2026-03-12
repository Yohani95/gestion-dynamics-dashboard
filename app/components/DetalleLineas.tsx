"use client";

import { useEffect, useState } from "react";
import { useInstance, fetchWithInstance } from "./InstanceContext";

type Linea = {
  nroLinea: number;
  idDetalle: string;
  tipoMovimiento: string;
  estado: number | null;
  fecha: string | null;
  idDocumentoDynamics: string | null;
};

type Props = {
  idDocumento: string;
  tipo: string;
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

export default function DetalleLineas({ idDocumento, tipo }: Props) {
  const { instance } = useInstance();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idDocumento || !tipo) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ idDocumento, tipo });
    fetchWithInstance(`/api/documento/lineas?${params}`, {}, instance)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          setLineas([]);
        } else {
          setLineas(json.lineas ?? []);
        }
      })
      .catch(() => {
        setError("Error al cargar líneas");
        setLineas([]);
      })
      .finally(() => setLoading(false));
  }, [idDocumento, tipo, instance]);

  if (loading) {
    return (
      <p className="text-sm text-slate-600">Cargando detalle por línea…</p>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        {error}
      </div>
    );
  }

  if (lineas.length === 0) {
    return (
      <p className="text-sm text-slate-600">No hay líneas para este documento.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[400px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-900 text-left">
            <th className="p-2.5 text-xs font-semibold uppercase tracking-wide text-slate-100">
              Línea
            </th>
            <th className="p-2.5 text-xs font-semibold uppercase tracking-wide text-slate-100">
              Tipo mov.
            </th>
            <th className="p-2.5 text-xs font-semibold uppercase tracking-wide text-slate-100">
              Estado Dynamics
            </th>
            <th className="hidden p-2.5 text-xs font-semibold uppercase tracking-wide text-slate-100 sm:table-cell">
              Fecha
            </th>
            <th className="p-2.5 text-xs font-semibold uppercase tracking-wide text-slate-100">
              Id Dynamics
            </th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => (
            <tr
              key={l.idDetalle}
              className="border-b border-slate-100 even:bg-slate-50 hover:bg-slate-100/70"
            >
              <td className="p-2.5 font-mono font-semibold text-slate-900">
                {l.nroLinea}
              </td>
              <td className="p-2.5 text-slate-800">{l.tipoMovimiento}</td>
              <td className="p-2.5">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${estadoChip(
                    l.estado
                  )}`}
                >
                  {l.estado != null
                    ? estadoLabel[l.estado] ?? l.estado
                    : "—"}
                </span>
              </td>
              <td className="hidden p-2.5 text-slate-700 sm:table-cell">
                {l.fecha ? l.fecha.slice(0, 19).replace("T", " ") : "—"}
              </td>
              <td className="max-w-[140px] truncate p-2.5 font-mono text-xs text-slate-900" title={l.idDocumentoDynamics ?? ""}>
                {l.idDocumentoDynamics ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
