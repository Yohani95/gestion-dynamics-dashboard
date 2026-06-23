import type { ResultadoAuditorDocumento } from "@/lib/auditorDynamics.types";

export const RECONCILIACION_LOTE = 6;
export const RECONCILIACION_APLICAR_MAX = 25;

export type ReconciliacionItem = ResultadoAuditorDocumento & {
  candidato: boolean;
  estadoPropuesto: number;
  idBcDynamics: string | null;
  motivoExclusion: string | null;
};

export type AplicarReconciliacionIn = {
  idDocumento: string;
  tipo: string;
  numero: number;
  idBcDynamics?: string | null;
};

export type AplicarReconciliacionResult = {
  idDocumento: string;
  tipo: string;
  numero: number;
  ok: boolean;
  filasActualizadas: number;
  filasInsertadas: number;
  error?: string;
};
