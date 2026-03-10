/**
 * Utilidades de reportería: exportar CSV y imprimir.
 */

const BOM = "\uFEFF";
/** Punto y coma para que Excel en español abra cada valor en una columna */
const SEPARATOR = ";";

function escapeCsvCell(value: string): string {
  const s = String(value ?? "").trim();
  if (s.includes(SEPARATOR) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Convierte cabeceras y filas en CSV. Primera línea = cabeceras; resto = datos.
 * Separador ";" para Excel (es).
 */
export function rowsToCsv(headers: string[], rows: string[][]): string {
  if (!headers.length) return "";
  const headerLine = headers.map((h) => escapeCsvCell(String(h))).join(SEPARATOR);
  const dataLines = rows.map((row) =>
    headers.map((_, i) => escapeCsvCell(row[i] != null ? String(row[i]) : "")).join(SEPARATOR)
  );
  return headerLine + "\r\n" + dataLines.join("\r\n");
}

/**
 * Descarga el CSV en UTF-8 con BOM para que Excel reconozca encoding y cabecera.
 */
export function downloadCsv(filename: string, csv: string): void {
  const withBom = BOM + csv;
  const bytes = new TextEncoder().encode(withBom);
  const blob = new Blob([bytes], { type: "text/csv;charset=utf-8;" });
  downloadBlob(filename.endsWith(".csv") ? filename : `${filename}.csv`, blob);
}

/**
 * Exporta a Excel (.xlsx) en formato tipo tabla:
 * - Cabecera en primera fila
 * - Autofiltro
 * - Anchos de columna estimados
 *
 * Se carga `xlsx` dinámicamente para no impactar el bundle inicial.
 */
export async function downloadXlsxTable(opts: {
  filename: string;
  sheetName?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}): Promise<void> {
  const { filename, sheetName = "Reporte", headers, rows } = opts;
  if (!headers.length) return;

  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = [
    headers,
    ...rows.map((r) => headers.map((_, i) => (r[i] == null ? "" : (r[i] as string | number)))),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const ref = ws["!ref"];
  if (ref) {
    ws["!autofilter"] = { ref };
  }

  // Estimar ancho por columna (wch) basado en header + contenido visible
  const cols = headers.map((h, i) => {
    const maxLen = Math.max(
      String(h).length,
      ...rows.map((r) => String(r[i] ?? "").length),
    );
    return { wch: Math.min(60, Math.max(10, maxLen + 2)) };
  });
  (ws as any)["!cols"] = cols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  downloadBlob(filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`, blob);
}

/**
 * Dispara la impresión del documento. Si se pasa selector, solo se imprime ese elemento
 * (se oculta el resto con una hoja de estilo de impresión).
 */
export function triggerPrint(selector?: string): void {
  if (selector) {
    const el = document.querySelector(selector);
    if (el) {
      (el as HTMLElement).setAttribute("data-print-only", "true");
      const style = document.createElement("style");
      style.id = "print-report-style";
      style.textContent = `
        @media print {
          body * { visibility: hidden !important; }
          #print-report-style, script, style { display: none !important; }
          ${selector}, ${selector} * { visibility: visible !important; }
          ${selector} { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            width: 100% !important; 
            transform: none !important; 
            transition: none !important;
          }
        }
      `;
      document.head.appendChild(style);
      window.print();
      (el as HTMLElement).removeAttribute("data-print-only");
      setTimeout(() => {
        document.getElementById("print-report-style")?.remove();
      }, 500);
    } else {
      window.print();
    }
  } else {
    window.print();
  }
}
