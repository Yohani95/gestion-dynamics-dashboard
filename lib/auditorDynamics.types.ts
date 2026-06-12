export const AUDITOR_DYNAMICS_LOTE = 6;
export const AUDITOR_MONTO_TOLERANCIA = 2;

export type HallazgoCodigo =
  | "ok"
  | "sin_timbrar"
  | "no_en_bc"
  | "monto_diferente"
  | "menos_lineas"
  | "mas_lineas"
  | "lineas_duplicadas_bc"
  | "error_bc";

export type HallazgoAuditor = {
  codigo: HallazgoCodigo;
  severidad: "ok" | "warning" | "error";
  mensaje: string;
};

export type ResultadoAuditorDocumento = {
  tipo: string;
  numero: number;
  codEmpresa: string;
  empresaNombre: string;
  fechaEmision?: string;
  numeroBc: string;
  estadoAuditoria: "ok" | "warning" | "error" | "omitido";
  hallazgos: HallazgoAuditor[];
  gestion: {
    lineas: number;
    total: number;
    estadoSII: number | null;
    estadoEnvio: number | null;
  };
  bc?: {
    encontrado: boolean;
    lineas: number;
    total?: number;
    estado?: string;
  };
};
