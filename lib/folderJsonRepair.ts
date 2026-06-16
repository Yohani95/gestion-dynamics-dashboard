import type { ConnectionPool } from "mssql";
import sql from "mssql";

type DetalleRow = {
  Nro_Linea: number;
  Descripcion: string | null;
  Cantidad: number | null;
  Precio_Unitario: number | null;
  Total: number | null;
  Descuento_Porcentaje: number | null;
  Descuento_Monto: number | null;
};

type FolderItemDetalle = {
  Nrolinea: string;
  TipoCodigo: string;
  CodigoProducto: string;
  Variante: string;
  DescripcionProducto: string;
  Cantidad: string;
  UnidadMedida: string;
  PrecioUnitario: string;
  PorcentajeDescuento: string;
  MontoDescuento: string;
  PorcentajeRecargo: number;
  MontoRecargo: number;
  Total: string;
  IndicadorExepcionTotal: number;
  DescripcionExtendida: string;
};

function formatMoney(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function buildItemFromDetalle(row: DetalleRow): FolderItemDetalle {
  const desc = String(row.Descripcion ?? "ITEM").trim() || "ITEM";
  const qty = row.Cantidad ?? 1;
  const total = row.Total ?? row.Precio_Unitario ?? 0;
  const unit = row.Precio_Unitario ?? total;

  return {
    Nrolinea: String(row.Nro_Linea),
    TipoCodigo: "EAN128",
    CodigoProducto: desc,
    Variante: "",
    DescripcionProducto: desc,
    Cantidad: String(qty),
    UnidadMedida: "UN",
    PrecioUnitario: formatMoney(unit),
    PorcentajeDescuento: formatMoney(row.Descuento_Porcentaje),
    MontoDescuento: String(row.Descuento_Monto ?? 0),
    PorcentajeRecargo: 0,
    MontoRecargo: 0,
    Total: formatMoney(total),
    IndicadorExepcionTotal: 0,
    DescripcionExtendida: desc,
  };
}

/** El SP Ges_Ele_XmlEnvioSII_Folder omite líneas FLETE y deja JSON inválido (ItemDetalle vacío). */
function repairMalformedItemDetalle(raw: string): string {
  return raw.replace(/"ItemDetalle"\s*:\s*\n\s*\],/g, '"ItemDetalle": [],');
}

function parseFolderPayload(raw: string): Record<string, unknown> | null {
  const attempts = [raw, repairMalformedItemDetalle(raw)];
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* siguiente intento */
    }
  }
  return null;
}

function itemDetalleIsEmpty(payload: Record<string, unknown>): boolean {
  const items = payload.ItemDetalle;
  return !Array.isArray(items) || items.length === 0;
}

async function fetchDetalleRows(
  pool: ConnectionPool,
  tipo: string,
  documentId: string,
): Promise<DetalleRow[]> {
  const sqlByTipo: Record<string, string> = {
    NCV: `
      SELECT Det.Nro_Linea, Det.Descripcion, Det.Cantidad, Det.Precio_Unitario, Det.Total,
             Det.Descuento_Porcentaje, Det.Descuento_Monto
      FROM Ges_NcvDetalle Det WITH (NOLOCK)
      WHERE Det.Id_NotaCredito = @IdDocumento
      ORDER BY Det.Nro_Linea
    `,
    FCV: `
      SELECT Det.Nro_Linea, Det.Descripcion, Det.Cantidad, Det.Precio_Unitario, Det.Total,
             Det.Descuento_Porcentaje, Det.Descuento_Monto
      FROM Ges_FcvDetalle Det WITH (NOLOCK)
      WHERE Det.Id_Factura = @IdDocumento
      ORDER BY Det.Nro_Linea
    `,
    BLE: `
      SELECT Det.Nro_Linea, Det.Descripcion, Det.Cantidad, Det.Precio_Unitario, Det.Total,
             Det.Descuento_Porcentaje, Det.Descuento_Monto
      FROM Ges_BlvDetalle Det WITH (NOLOCK)
      WHERE Det.Id_Boleta = @IdDocumento
        AND UPPER(LTRIM(RTRIM(ISNULL(Det.Tipo_Movimiento, '')))) <> 'C'
      ORDER BY Det.Nro_Linea
    `,
  };

  const queryText = sqlByTipo[tipo];
  if (!queryText) return [];

  const result = await pool
    .request()
    .input("IdDocumento", sql.UniqueIdentifier, documentId)
    .query<DetalleRow>(queryText);

  return result.recordset ?? [];
}

export type FolderJsonPrepareResult =
  | { ok: true; json: string; patched: boolean; detail?: string }
  | { ok: false; error: string; debug?: unknown };

/**
 * Valida y, si hace falta, completa ItemDetalle antes de enviar a Folder.
 * Cubre NCV/BLE/FCV cuyo SP excluye líneas de flete (FLETE-000) y deja JSON inválido.
 */
export async function prepareFolderJsonPayload(
  pool: ConnectionPool,
  tipo: string,
  documentId: string,
  jsonEnvioSII: string,
): Promise<FolderJsonPrepareResult> {
  const tipoUpper = tipo.toUpperCase();
  let payload = parseFolderPayload(jsonEnvioSII);

  if (!payload) {
    return {
      ok: false,
      error:
        "El JSON de Folder devuelto por Ges_Ele_XmlEnvioSII_Folder es inválido (ItemDetalle mal formado).",
      debug: jsonEnvioSII.slice(0, 600),
    };
  }

  if (!itemDetalleIsEmpty(payload)) {
    return { ok: true, json: JSON.stringify(payload), patched: false };
  }

  const detalleRows = await fetchDetalleRows(pool, tipoUpper, documentId);
  if (detalleRows.length === 0) {
    return {
      ok: false,
      error: "Folder requiere al menos una línea en ItemDetalle y el documento no tiene detalle en Gestión.",
    };
  }

  payload = {
    ...payload,
    ItemDetalle: detalleRows.map(buildItemFromDetalle),
  };

  const fleteOnly = detalleRows.every((r) =>
    String(r.Descripcion ?? "").toUpperCase().includes("FLETE"),
  );

  return {
    ok: true,
    json: JSON.stringify(payload),
    patched: true,
    detail: fleteOnly
      ? "Se completó ItemDetalle con línea(s) de flete omitida(s) por el SP (ej. FLETE-000)."
      : "Se completó ItemDetalle desde Ges_*Detalle porque el SP no lo generó.",
  };
}
