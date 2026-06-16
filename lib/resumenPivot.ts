/**
 * Convierte el resumen plano (empresa × fecha × tipo × estado) en tabla pivot
 * similar a Excel: nombre de entidad arriba, detalle por estado debajo.
 */

export type ResumenPlano = {
  descripcion: string;
  fecha: string;
  codEmpresa: string;
  tipo: string;
  estado: number;
  categoria: string;
  cantidad: number;
};

export type PivotFila = {
  empresa: string;
  codEmpresa: string;
  estado: number | null;
  etiqueta: string;
  /** Nombre de la entidad (primera fila del bloque, lleva el toggle) */
  esEncabezadoGrupo: boolean;
  /** Detalle por estado (indentado, debajo del nombre) */
  esDetalleEstado: boolean;
  /** Subtotal al cierre del bloque */
  esSubtotalGrupo: boolean;
  valores: Record<string, number>;
  total: number;
};

export type PivotResultado = {
  fechas: string[];
  fechasLabel: string[];
  filas: PivotFila[];
  totalGeneral: number;
  totalesPorFecha: Record<string, number>;
};

import { etiquetaCategoria, ordenCategoria } from "@/lib/resumenCategorias";

/** YYYY-MM-DD → DD-MM-YYYY (como en el Excel de referencia) */
export function fechaPivotLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function sumar(a: Record<string, number>, fecha: string, n: number) {
  a[fecha] = (a[fecha] ?? 0) + n;
}

export function buildResumenPivot(resumen: ResumenPlano[]): PivotResultado {
  if (!resumen.length) {
    return { fechas: [], fechasLabel: [], filas: [], totalGeneral: 0, totalesPorFecha: {} };
  }

  const fechas = [...new Set(resumen.map((r) => r.fecha))].sort();
  const fechasLabel = fechas.map(fechaPivotLabel);

  const empresasOrden = [...new Map(
    resumen.map((r) => [r.codEmpresa, r.descripcion] as const),
  ).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));

  const bucket = new Map<string, Record<string, number>>();
  const key = (cod: string, categoria: string) => `${cod}::${categoria}`;

  for (const r of resumen) {
    const k = key(r.codEmpresa, r.categoria);
    if (!bucket.has(k)) bucket.set(k, {});
    sumar(bucket.get(k)!, r.fecha, r.cantidad);
  }

  const filas: PivotFila[] = [];
  const totalesPorFecha: Record<string, number> = {};

  for (const [codEmpresa, descripcion] of empresasOrden) {
    const categoriasEmpresa = [
      ...new Set(
        resumen.filter((r) => r.codEmpresa === codEmpresa).map((r) => r.categoria),
      ),
    ].sort((a, b) => ordenCategoria(a) - ordenCategoria(b));

    const subtotalValores: Record<string, number> = {};
    let subtotalTotal = 0;

    for (const categoria of categoriasEmpresa) {
      const valores = bucket.get(key(codEmpresa, categoria)) ?? {};
      for (const f of fechas) {
        const v = valores[f] ?? 0;
        sumar(subtotalValores, f, v);
        sumar(totalesPorFecha, f, v);
        subtotalTotal += v;
      }
    }

    if (subtotalTotal === 0) continue;

    // 1) Nombre de la entidad ARRIBA
    filas.push({
      empresa: descripcion,
      codEmpresa,
      estado: null,
      etiqueta: descripcion,
      esEncabezadoGrupo: true,
      esDetalleEstado: false,
      esSubtotalGrupo: false,
      valores: subtotalValores,
      total: subtotalTotal,
    });

    // 2) Detalle por categoría DEBAJO del nombre
    for (const categoria of categoriasEmpresa) {
      const valores = { ...(bucket.get(key(codEmpresa, categoria)) ?? {}) };
      const total = Object.values(valores).reduce((s, n) => s + n, 0);
      if (total === 0) continue;

      filas.push({
        empresa: descripcion,
        codEmpresa,
        estado: null,
        etiqueta: etiquetaCategoria(categoria),
        esEncabezadoGrupo: false,
        esDetalleEstado: true,
        esSubtotalGrupo: false,
        valores,
        total,
      });
    }

    // 3) Subtotal al cierre
    filas.push({
      empresa: descripcion,
      codEmpresa,
      estado: null,
      etiqueta: `${descripcion} Total`,
      esEncabezadoGrupo: false,
      esDetalleEstado: false,
      esSubtotalGrupo: true,
      valores: subtotalValores,
      total: subtotalTotal,
    });
  }

  const totalGeneral = Object.values(totalesPorFecha).reduce((s, n) => s + n, 0);

  return { fechas, fechasLabel, filas, totalGeneral, totalesPorFecha };
}

export function pivotToXlsxRows(pivot: PivotResultado): (string | number)[][] {
  const header: (string | number)[] = ["Etiquetas de fila", ...pivot.fechasLabel, "Total general"];
  const rows: (string | number)[][] = [header];

  for (const f of pivot.filas) {
    const prefijo = f.esDetalleEstado ? "    " : "";
    rows.push([
      `${prefijo}${f.etiqueta}`,
      ...pivot.fechas.map((fecha) => f.valores[fecha] ?? ""),
      f.total,
    ]);
  }

  rows.push([
    "Total general",
    ...pivot.fechas.map((fecha) => pivot.totalesPorFecha[fecha] ?? 0),
    pivot.totalGeneral,
  ]);

  return rows;
}
