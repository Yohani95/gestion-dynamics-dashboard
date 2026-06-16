/**
 * Categorías del reporte pivot (alineadas al Excel operativo).
 * El estado numérico 2 se desglosa según error BC o líneas incompletas.
 */

export const CATEGORIAS_ORDEN = [
  "0",
  "1",
  "2",
  "2_reg",
  "2_inv",
  "2_diff",
  "3",
  "4",
] as const;

const CATEGORIAS_ESTADO_2 = new Set(["2", "2_reg", "2_inv", "2_diff"]);

export type CategoriaResumen = (typeof CATEGORIAS_ORDEN)[number] | string;

export const ETIQUETAS_CATEGORIA: Record<string, string> = {
  "0": "0 - No enviado a Dynamics",
  "1": "1 - Enviada (pendiente localización)",
  "2": "2 - No registrado (localización OK)",
  "2_reg": "2 - No registrado (falta registro)",
  "2_inv": "2 - No registrado (inventario)",
  "2_diff": "2 - No registrado (diferencia / líneas)",
  "3": "3 - Registrado",
  "4": "4 - Medio de pago listo",
};

export function etiquetaCategoria(categoria: string): string {
  return ETIQUETAS_CATEGORIA[categoria] ?? categoria;
}

export function normalizarCategoria(item: { estado: number; categoria?: string }): string {
  if (item.categoria) return item.categoria;
  if (item.estado === 2) return "2";
  return String(item.estado);
}

export function esCategoriaNoRegistrado(categoria: string): boolean {
  return CATEGORIAS_ESTADO_2.has(categoria);
}

/** Agrupa 2_reg / 2_inv / 2_diff en una sola fila «2» para el pivot sin desglose. */
export function agruparFilasEstado2<
  T extends {
    descripcion: string;
    fecha: string;
    codEmpresa: string;
    tipo: string;
    estado: number;
    categoria: string;
    cantidad: number;
  },
>(filas: T[]): T[] {
  const map = new Map<string, T>();

  for (const fila of filas) {
    const categoria =
      fila.estado === 2 && fila.categoria !== "2" ? "2" : fila.categoria;
    const key = `${fila.codEmpresa}|${fila.fecha}|${fila.tipo}|${categoria}`;

    const prev = map.get(key);
    if (prev) {
      prev.cantidad += fila.cantidad;
      continue;
    }

    map.set(key, { ...fila, categoria, estado: fila.estado === 2 ? 2 : fila.estado });
  }

  return Array.from(map.values());
}

export function ordenCategoria(categoria: string): number {
  const idx = CATEGORIAS_ORDEN.indexOf(categoria as (typeof CATEGORIAS_ORDEN)[number]);
  return idx >= 0 ? idx : 99;
}

/** Expresión SQL CASE para clasificar un documento */
export function sqlCategoriaCase(
  estadoExpr = "ISNULL(Estado, 0)",
  errorExpr = "ISNULL(UltimoError, '')",
  lineasGestion = "ISNULL(Lineas_Gestion, 0)",
  lineasOk = "ISNULL(Lineas_Dynamics_OK, 0)",
): string {
  return `
    CASE
      WHEN ${estadoExpr} = 0 THEN '0'
      WHEN ${estadoExpr} = 1 THEN '1'
      WHEN ${estadoExpr} = 2 THEN
        CASE
          WHEN ${errorExpr} LIKE '%inventar%'
            OR ${errorExpr} LIKE '%inventory%'
            OR ${errorExpr} LIKE '%not in inventory%'
            OR ${errorExpr} LIKE '%stock%'
            OR ${errorExpr} LIKE '%sin stock%'
          THEN '2_inv'
          WHEN ${errorExpr} LIKE '%diferenc%'
            OR ${errorExpr} LIKE '%difference%'
            OR ${errorExpr} LIKE '%monto%'
            OR ${errorExpr} LIKE '%amount%'
            OR ${errorExpr} LIKE '%precio%'
            OR ${errorExpr} LIKE '%price%'
            OR (${lineasGestion} > ${lineasOk} AND ${lineasGestion} > 0)
          THEN '2_diff'
          ELSE '2_reg'
        END
      WHEN ${estadoExpr} = 3 THEN '3'
      WHEN ${estadoExpr} = 4 THEN '4'
      ELSE '0'
    END
  `;
}
