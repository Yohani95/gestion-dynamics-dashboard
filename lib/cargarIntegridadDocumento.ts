import { query } from "@/lib/db";
import { evaluarIntegridadVenta, type IntegridadReporte } from "@/lib/integridadVenta";

type DocIn = {
  tipo: string;
  idDocumento: string;
  estadoSII: number | null;
  estadoEnvio: number | null;
  idDocumentoDynamics: string | null;
  lineasGestion: number;
  lineasDynamicsOk: number;
};

type LineaRow = {
  Nro_Linea: number;
  Tipo_Movimiento: string | null;
  Estado: number | null;
  Id_Documento_Dynamics: string | null;
};

type ErrorIn = { mensaje?: string; error?: string };

function sqlLineasPorTipo(tipo: string): string {
  if (tipo === "BLE") {
    return `
      SELECT Det.Nro_Linea, Det.Tipo_Movimiento, E.Estado, E.Id_Documento_Dynamics
      FROM Ges_BlvDetalle Det WITH (NOLOCK)
      LEFT JOIN Ges_EstadoEnvioDynamics E WITH (NOLOCK)
        ON E.Id_Documento = Det.Id_Boleta AND E.Id_Documento_Detalle = Det.Id_DetalleBoleta
      WHERE Det.Id_Boleta = CAST(@idDocumento AS UNIQUEIDENTIFIER)
      ORDER BY Det.Nro_Linea
    `;
  }
  if (tipo === "FCV") {
    return `
      SELECT Det.Nro_Linea, CAST('' AS NVARCHAR(20)) AS Tipo_Movimiento, E.Estado, E.Id_Documento_Dynamics
      FROM Ges_FcvDetalle Det WITH (NOLOCK)
      LEFT JOIN Ges_EstadoEnvioDynamics E WITH (NOLOCK)
        ON E.Id_Documento = Det.Id_Factura AND E.Id_Documento_Detalle = Det.Id_DetalleFactura
      WHERE Det.Id_Factura = CAST(@idDocumento AS UNIQUEIDENTIFIER)
      ORDER BY Det.Nro_Linea
    `;
  }
  return `
    SELECT Det.Nro_Linea, CAST('' AS NVARCHAR(20)) AS Tipo_Movimiento, E.Estado, E.Id_Documento_Dynamics
    FROM Ges_NcvDetalle Det WITH (NOLOCK)
    LEFT JOIN Ges_EstadoEnvioDynamics E WITH (NOLOCK)
      ON E.Id_Documento = Det.Id_NotaCredito AND E.Id_Documento_Detalle = Det.Id_DetalleNotaCredito
    WHERE Det.Id_NotaCredito = CAST(@idDocumento AS UNIQUEIDENTIFIER)
    ORDER BY Det.Nro_Linea
  `;
}

/** Carga líneas SQL y evalúa integridad Gestión vs Dynamics (sin consulta BC). */
export async function evaluarIntegridadDesdeDocumento(
  doc: DocIn,
  errores: ErrorIn[],
  instance?: string,
): Promise<IntegridadReporte> {
  const lineasRows = await query<LineaRow[]>(
    sqlLineasPorTipo(doc.tipo),
    { idDocumento: doc.idDocumento },
    instance,
  );

  const lineas = (lineasRows ?? [])
    .filter((l) => (l.Tipo_Movimiento ?? "").toUpperCase() !== "C")
    .map((l) => ({
      nroLinea: l.Nro_Linea,
      tipoMovimiento: l.Tipo_Movimiento,
      estado: l.Estado,
      idDocumentoDynamics: l.Id_Documento_Dynamics,
    }));

  return evaluarIntegridadVenta(
    {
      estadoSII: doc.estadoSII,
      estadoEnvio: doc.estadoEnvio,
      idDocumentoDynamics: doc.idDocumentoDynamics,
      lineasGestion: doc.lineasGestion,
      lineasDynamicsOk: doc.lineasDynamicsOk,
    },
    lineas,
    errores,
  );
}
