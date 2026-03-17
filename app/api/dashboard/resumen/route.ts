import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool } from "@/lib/db";
import { getAdvancedJobsSnapshot } from "@/lib/advancedJobs";
import { getInstanceMeta, resolveInstanceId } from "@/lib/instances";

export const dynamic = "force-dynamic";

type VentasKpiRow = {
  SinEnviarHoy: number | null;
  RegistradasHoy: number | null;
};

type TransferenciasAbiertasRow = {
  Abiertas: number | null;
};

type IncidenciaRow = {
  Traspaso: string;
  Tipo: string;
  EstadoSat: string;
  FechaErrorBc: Date | string | null;
  MotivoPrincipal: string;
  TotalErrores3Dias: number | null;
};

type JobFallidoResumen = {
  name: string;
  lastRunAt: string | null;
  lastDurationSec: number | null;
};

function getSantiagoDateString() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function toIsoStringOrNull(value: Date | string | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function GET(request: NextRequest) {
  const instance = resolveInstanceId(request.headers.get("x-instance"));
  const instanceMeta = getInstanceMeta(instance);
  const supportsTransferencias = instanceMeta.supportsTransferencias;
  const fechaCorte = getSantiagoDateString();

  try {
    const pool = await getPool(instance);

    const ventasRequest = pool.request();
    ventasRequest.input("fechaCorte", sql.VarChar(10), fechaCorte);

    const ventasQuery = `
      WITH EstDyn AS (
        SELECT Id_Documento, MIN(Estado) AS Estado
        FROM Ges_EstadoEnvioDynamics WITH (NOLOCK)
        GROUP BY Id_Documento
      ),
      VentasBase AS (
        SELECT ISNULL(L.Estado, 0) AS Estado
        FROM Ges_BlvCabecera Cab WITH (NOLOCK)
        LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_Boleta
        WHERE CONVERT(DATE, Cab.Fecha_Emision) = CAST(@fechaCorte AS DATE)

        UNION ALL

        SELECT ISNULL(L.Estado, 0) AS Estado
        FROM Ges_FcvCabecera Cab WITH (NOLOCK)
        LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_Factura
        WHERE CONVERT(DATE, Cab.Fecha_Emision) = CAST(@fechaCorte AS DATE)

        UNION ALL

        SELECT ISNULL(L.Estado, 0) AS Estado
        FROM Ges_NcvCabecera Cab WITH (NOLOCK)
        LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_NotaCredito
        WHERE CONVERT(DATE, Cab.Fecha_Emision) = CAST(@fechaCorte AS DATE)
      )
      SELECT
        SUM(CASE WHEN Estado = 0 THEN 1 ELSE 0 END) AS SinEnviarHoy,
        SUM(CASE WHEN Estado = 3 THEN 1 ELSE 0 END) AS RegistradasHoy
      FROM VentasBase;
    `;

    const ventasResult = await ventasRequest.query<VentasKpiRow>(ventasQuery);
    const ventasRow = ventasResult.recordset[0] ?? {
      SinEnviarHoy: 0,
      RegistradasHoy: 0,
    };

    let abiertasRow: TransferenciasAbiertasRow = { Abiertas: 0 };
    let incidenciaRows: IncidenciaRow[] = [];
    let errores3Dias = 0;

    if (supportsTransferencias) {
      const abiertasQuery = `
        WITH LatestStatus AS (
          SELECT
            Traspaso,
            Tipo,
            Estado,
            ROW_NUMBER() OVER(PARTITION BY Traspaso, Tipo ORDER BY Fecha DESC) AS rn
          FROM Ges_EstadoEnvioTraspasos WITH (NOLOCK)
        )
        SELECT COUNT(*) AS Abiertas
        FROM LatestStatus
        WHERE rn = 1
          AND Estado <> 'OK';
      `;

      const abiertasResult =
        await pool.request().query<TransferenciasAbiertasRow>(abiertasQuery);
      abiertasRow = abiertasResult.recordset[0] ?? { Abiertas: 0 };

      const incidenciasRequest = pool.request();
      incidenciasRequest.input("limite", sql.Int, 10);

      const incidenciasQuery = `
        WITH LatestLogs AS (
          SELECT
            EstiloColor AS Traspaso,
            Tipo_Carga,
            Resultado,
            Fecha_Carga,
            Atributos,
            ROW_NUMBER() OVER(
              PARTITION BY EstiloColor, Tipo_Carga
              ORDER BY Fecha_Carga DESC
            ) AS rn_l
          FROM Ges_LogCargaDynamics WITH (NOLOCK)
          WHERE Fecha_Carga >= DATEADD(day, -3, GETDATE())
            AND Tipo_Carga LIKE 'Traspaso%'
            AND Resultado = 'ERROR'
        ),
        LatestStatus AS (
          SELECT
            Traspaso,
            Tipo,
            Estado,
            Fecha,
            ROW_NUMBER() OVER(PARTITION BY Traspaso, Tipo ORDER BY Fecha DESC) AS rn_s
          FROM Ges_EstadoEnvioTraspasos WITH (NOLOCK)
        ),
        Incidencias AS (
          SELECT
            S.Traspaso,
            S.Tipo,
            S.Estado AS EstadoSat,
            L.Fecha_Carga AS FechaErrorBc,
            CASE
              WHEN CAST(L.Atributos AS VARCHAR(MAX)) LIKE '%is not in inventory%' THEN 'SIN STOCK EN ORIGEN'
              WHEN CAST(L.Atributos AS VARCHAR(MAX)) LIKE '%We can''t save your changes right now%' THEN 'BLOQUEO TEMP (LOCKING)'
              ELSE 'OTRO ERROR'
            END AS MotivoPrincipal,
            COUNT(*) OVER() AS TotalErrores3Dias
          FROM LatestLogs L
          INNER JOIN LatestStatus S
            ON S.Traspaso = L.Traspaso
            AND S.rn_s = 1
            AND (
              (L.Tipo_Carga LIKE '%Despacho%' AND S.Tipo = 'D') OR
              (L.Tipo_Carga LIKE '%Recepcion%' AND S.Tipo = 'R')
            )
          WHERE L.rn_l = 1
            AND S.Estado <> 'OK'
            AND (
              CAST(L.Atributos AS VARCHAR(MAX)) LIKE '%is not in inventory%' OR
              CAST(L.Atributos AS VARCHAR(MAX)) LIKE '%We can''t save your changes right now%'
            )
        )
        SELECT TOP (@limite)
          Traspaso,
          Tipo,
          EstadoSat,
          FechaErrorBc,
          MotivoPrincipal,
          TotalErrores3Dias
        FROM Incidencias
        ORDER BY FechaErrorBc DESC;
      `;

      const incidenciasResult =
        await incidenciasRequest.query<IncidenciaRow>(incidenciasQuery);
      incidenciaRows = incidenciasResult.recordset ?? [];
      errores3Dias =
        incidenciaRows.length > 0
          ? Number(incidenciaRows[0].TotalErrores3Dias ?? incidenciaRows.length)
          : 0;
    }

    let jobsResumen = {
      running: 0,
      failed24h: 0,
      longRunning: 0,
      totalJobs: 0,
      topFailed: [] as JobFallidoResumen[],
    };

    try {
      const jobsSnapshot = await getAdvancedJobsSnapshot({
        instanceHeader: instance,
        limit: 500,
        longRunningMin: 30,
      });

      const topFailed = jobsSnapshot.jobs
        .filter((job) => job.isFailed24h && Boolean(job.lastRunAt))
        .sort((a, b) => {
          const aTs = a.lastRunAt ?? "";
          const bTs = b.lastRunAt ?? "";
          return bTs.localeCompare(aTs);
        })
        .slice(0, 5)
        .map((job) => ({
          name: job.name,
          lastRunAt: job.lastRunAt,
          lastDurationSec: job.lastDurationSec,
        }));

      jobsResumen = {
        running: jobsSnapshot.kpis.running,
        failed24h: jobsSnapshot.kpis.failed24h,
        longRunning: jobsSnapshot.kpis.longRunning,
        totalJobs: jobsSnapshot.kpis.totalJobs,
        topFailed,
      };
    } catch (jobsError) {
      const err =
        jobsError instanceof Error ? jobsError : new Error(String(jobsError));
      console.warn("[API dashboard/resumen] jobs resumen no disponible:", err.message);
    }

    return NextResponse.json({
      fechaCorte,
      timezone: "America/Santiago" as const,
      ventas: {
        sinEnviarHoy: Number(ventasRow.SinEnviarHoy ?? 0),
        registradasHoy: Number(ventasRow.RegistradasHoy ?? 0),
      },
      transferencias: {
        errores3Dias,
        abiertas: Number(abiertasRow.Abiertas ?? 0),
      },
      jobs: jobsResumen,
      topIncidencias: incidenciaRows.map((row) => ({
        traspaso: row.Traspaso,
        tipo: row.Tipo,
        estadoSat: row.EstadoSat,
        fechaErrorBc: toIsoStringOrNull(row.FechaErrorBc),
        motivoPrincipal: row.MotivoPrincipal,
      })),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[API dashboard/resumen]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
