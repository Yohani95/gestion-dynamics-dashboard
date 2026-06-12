export type ExcelFilaParsed = {
  rut: string;
  numero: string;
  tipo: string;
  fila: number;
};

export type ExcelParseResult = {
  filas: ExcelFilaParsed[];
  errores: string[];
};

const TIPO_ALIASES: Record<string, string> = {
  BLE: "BLE",
  BLV: "BLE",
  BOLETA: "BLE",
  BOLETAS: "BLE",
  "39": "BLE",
  FCV: "FCV",
  FACTURA: "FCV",
  FACTURAS: "FCV",
  "33": "FCV",
  NCV: "NCV",
  NC: "NCV",
  "NOTA CREDITO": "NCV",
  "NOTA DE CREDITO": "NCV",
  "61": "NCV",
  GDV: "GDV",
  GUIA: "GDV",
  "GUIA DESPACHO": "GDV",
  "52": "GDV",
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeRut(value: string): string {
  return value.replace(/[.\s-]/g, "").toUpperCase().trim();
}

export function normalizeTipoFolio(value: string): string | null {
  const key = value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (TIPO_ALIASES[key]) return TIPO_ALIASES[key];
  if (["BLE", "FCV", "NCV", "GDV"].includes(key)) return key;
  return null;
}

function mapHeaderToField(header: string): keyof Omit<ExcelFilaParsed, "fila"> | null {
  if (header === "rut" || header === "rut empresa") return "rut";
  if (
    header === "folio" ||
    header === "numero" ||
    header === "nro" ||
    header === "nro folio" ||
    header === "numero folio"
  ) {
    return "numero";
  }
  if (header === "tipo" || header === "tipo folio" || header === "tipo documento") return "tipo";
  return null;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return String(value).trim();
}

export function parseExcelRows(rows: unknown[][]): ExcelParseResult {
  const errores: string[] = [];
  const filas: ExcelFilaParsed[] = [];

  if (!rows.length) {
    return { filas, errores: ["El archivo esta vacio."] };
  }

  const headerRow = rows[0].map((cell) => normalizeHeader(cell));
  const columnMap: Partial<Record<keyof Omit<ExcelFilaParsed, "fila">, number>> = {};

  headerRow.forEach((header, index) => {
    const field = mapHeaderToField(header);
    if (field && columnMap[field] == null) columnMap[field] = index;
  });

  if (columnMap.rut == null || columnMap.numero == null || columnMap.tipo == null) {
    return {
      filas,
      errores: [
        "Encabezados requeridos: Rut Empresa, Nro Folio y Tipo Folio (BLE, FCV, NCV).",
      ],
    };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rut = normalizeRut(cellText(row[columnMap.rut!]));
    const numero = cellText(row[columnMap.numero!]);
    const tipoRaw = cellText(row[columnMap.tipo!]);
    const tipo = normalizeTipoFolio(tipoRaw);

    const allEmpty = !rut && !numero && !tipoRaw;
    if (allEmpty) continue;

    const fila = i + 1;
    if (!rut || !numero || !tipoRaw) {
      errores.push(`Fila ${fila}: faltan rut, folio o tipo.`);
      continue;
    }
    if (!tipo) {
      errores.push(`Fila ${fila}: tipo '${tipoRaw}' no reconocido (use BLE, FCV o NCV).`);
      continue;
    }

    filas.push({ rut, numero, tipo, fila });
  }

  if (!filas.length && !errores.length) {
    errores.push("No se encontraron filas validas en el archivo.");
  }

  return { filas, errores };
}

export async function readExcelFile(file: File): Promise<ExcelParseResult> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { filas: [], errores: ["El archivo no contiene hojas."] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  return parseExcelRows(rows);
}

export const REPROCESO_EXCEL_TEMPLATE_HEADERS = ["Rut Empresa", "Nro Folio", "Tipo Folio"];

export const REPROCESO_EXCEL_TEMPLATE_ROWS: (string | number)[][] = [
  ["78946240", 2241463, "BLE"],
  ["77112929", 100250, "FCV"],
];

export const REPROCESO_MASIVO_LOTE = 40;
