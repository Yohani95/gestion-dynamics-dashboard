export type IntegridadNivel = "ok" | "warning" | "error";

export type IntegridadCheck = {
  id: string;
  titulo: string;
  nivel: IntegridadNivel;
  detalle: string;
};

export type IntegridadLinea = {
  nroLinea: number;
  estado: number | null;
  idDocumentoDynamics: string | null;
  nivel: IntegridadNivel;
  detalle: string;
};

export type IntegridadDynamicsOData = {
  configurado: boolean;
  tokenOk: boolean;
  encontrado: boolean;
  resumen?: string;
  error?: string;
};

export type IntegridadReporte = {
  nivel: IntegridadNivel;
  resumen: string;
  checks: IntegridadCheck[];
  lineas: IntegridadLinea[];
  lineasGestion: number;
  lineasDynamicsOk: number;
  lineasConEstado: number;
  lineasConIdDynamics: number;
  dynamicsOData?: IntegridadDynamicsOData;
};

export const ESTADO_DYN_LABEL: Record<number, string> = {
  0: "Sin enviar",
  1: "Enviada",
  2: "Localización OK",
  3: "Registrado",
  4: "Medio de pago listo",
};

type LineaIn = {
  nroLinea: number;
  estado: number | null;
  idDocumentoDynamics: string | null;
  tipoMovimiento?: string | null;
};

type DocIn = {
  estadoSII: number | null;
  estadoEnvio: number | null;
  idDocumentoDynamics: string | null;
  lineasGestion?: number;
  lineasDynamicsOk?: number;
};

type ErrorIn = { mensaje?: string; error?: string };

export function labelEstadoDynamics(estado: number | null): string {
  if (estado == null) return "Sin dato";
  return ESTADO_DYN_LABEL[estado] ?? `Estado ${estado}`;
}

function nivelLinea(estado: number | null, idDyn: string | null): IntegridadNivel {
  if (estado == null) return "error";
  if (estado >= 3 && idDyn) return "ok";
  if (estado >= 1) return "warning";
  return "error";
}

function detalleLinea(estado: number | null, idDyn: string | null): string {
  if (estado == null) return "Sin registro de envío en Gestión.";
  const label = ESTADO_DYN_LABEL[estado] ?? `Estado ${estado}`;
  if (!idDyn) return `${label}. Falta vínculo con Dynamics.`;
  if (estado >= 3) return `${label}. Línea vinculada en Dynamics.`;
  return `${label}. Pendiente de registro completo.`;
}

export function evaluarIntegridadVenta(
  doc: DocIn,
  lineas: LineaIn[],
  errores: ErrorIn[],
  dynamicsOData?: IntegridadDynamicsOData,
): IntegridadReporte {
  const checks: IntegridadCheck[] = [];
  const lineasEvaluadas: IntegridadLinea[] = lineas.map((l) => ({
    nroLinea: l.nroLinea,
    estado: l.estado,
    idDocumentoDynamics: l.idDocumentoDynamics,
    nivel: nivelLinea(l.estado, l.idDocumentoDynamics),
    detalle: detalleLinea(l.estado, l.idDocumentoDynamics),
  }));

  const lineasGestion =
    doc.lineasGestion ?? lineas.filter((l) => (l.tipoMovimiento ?? "").toUpperCase() !== "C").length;
  const lineasConEstado = lineasEvaluadas.filter((l) => l.estado != null).length;
  const lineasConIdDynamics = lineasEvaluadas.filter((l) => !!l.idDocumentoDynamics).length;
  const lineasDynamicsOk =
    doc.lineasDynamicsOk ??
    lineasEvaluadas.filter((l) => l.nivel === "ok").length;

  if (doc.estadoSII !== 2) {
    checks.push({
      id: "sii",
      titulo: "Timbrado SII",
      nivel: "error",
      detalle:
        doc.estadoSII === 1
          ? "Documento sin timbrar. Dynamics no debería procesarlo aún."
          : `Estado SII actual: ${doc.estadoSII ?? "sin dato"}.`,
    });
  } else {
    checks.push({
      id: "sii",
      titulo: "Timbrado SII",
      nivel: "ok",
      detalle: "Documento timbrado (Estado_SII = 2).",
    });
  }

  if (doc.estadoEnvio == null) {
    checks.push({
      id: "envio",
      titulo: "Envío a Dynamics",
      nivel: "error",
      detalle: "Aún no hay registro de envío para este documento.",
    });
  } else if (doc.estadoEnvio < 3) {
    checks.push({
      id: "envio",
      titulo: "Registro en Dynamics",
      nivel: "warning",
      detalle: `${ESTADO_DYN_LABEL[doc.estadoEnvio] ?? `Estado ${doc.estadoEnvio}`}. El documento aún no queda registrado por completo.`,
    });
  } else {
    checks.push({
      id: "envio",
      titulo: "Registro en Dynamics",
      nivel: "ok",
      detalle: `${ESTADO_DYN_LABEL[doc.estadoEnvio] ?? `Estado ${doc.estadoEnvio}`}.`,
    });
  }

  if (doc.idDocumentoDynamics) {
    checks.push({
      id: "id-dyn",
      titulo: "Vínculo con Dynamics",
      nivel: "ok",
      detalle: "El documento tiene identificador en Dynamics.",
    });
  } else {
    checks.push({
      id: "id-dyn",
      titulo: "Vínculo con Dynamics",
      nivel: "warning",
      detalle: "Sin identificador de cabecera en Dynamics.",
    });
  }

  if (lineasGestion === 0) {
    checks.push({
      id: "lineas",
      titulo: "Líneas del documento",
      nivel: "warning",
      detalle: "El documento no tiene líneas operativas en Gestión.",
    });
  } else if (lineasDynamicsOk < lineasGestion) {
    checks.push({
      id: "lineas",
      titulo: "Sincronización por línea",
      nivel: "error",
      detalle: `${lineasDynamicsOk} de ${lineasGestion} líneas con Id Dynamics y estado registrado.`,
    });
  } else {
    checks.push({
      id: "lineas",
      titulo: "Sincronización por línea",
      nivel: "ok",
      detalle: `${lineasDynamicsOk}/${lineasGestion} líneas concuerdan en Gestión.`,
    });
  }

  if (errores.length > 0) {
    checks.push({
      id: "errores",
      titulo: "Errores de integración",
      nivel: "error",
      detalle: `Se registraron ${errores.length} error(es) al enviar a Dynamics.`,
    });
  } else {
    checks.push({
      id: "errores",
      titulo: "Errores de integración",
      nivel: "ok",
      detalle: "Sin errores registrados para este folio.",
    });
  }

  const tieneError = checks.some((c) => c.nivel === "error");
  const tieneWarning = checks.some((c) => c.nivel === "warning");
  const nivel: IntegridadNivel = tieneError ? "error" : tieneWarning ? "warning" : "ok";

  const resumen =
    nivel === "ok"
      ? "Integridad OK: Gestión y el estado de integración Dynamics concuerdan."
      : nivel === "warning"
        ? "Integridad parcial: hay pasos pendientes en Dynamics."
        : "Integridad con problemas: revisar líneas y errores Dynamics.";

  return {
    nivel,
    resumen,
    checks,
    lineas: lineasEvaluadas,
    lineasGestion,
    lineasDynamicsOk,
    lineasConEstado,
    lineasConIdDynamics,
    dynamicsOData,
  };
}
