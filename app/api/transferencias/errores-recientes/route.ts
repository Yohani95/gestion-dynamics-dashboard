import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET() {
    try {
        const pool = await getPool();

        // Query ultra-optimizada con CTEs para limpiar duplicados historicos
        const query = `
            WITH LatestLogs AS (
                SELECT 
                    EstiloColor as Traspaso,
                    Tipo_Carga,
                    Resultado,
                    Fecha_Carga,
                    Atributos,
                    ROW_NUMBER() OVER(PARTITION BY EstiloColor, Tipo_Carga ORDER BY Fecha_Carga DESC) as rn_l
                FROM Ges_LogCargaDynamics WITH(NOLOCK)
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
                    ROW_NUMBER() OVER(PARTITION BY Traspaso, Tipo ORDER BY Fecha DESC) as rn_s
                FROM Ges_EstadoEnvioTraspasos WITH(NOLOCK)
            )
            SELECT 
                 S.Traspaso AS Traspaso
                ,S.Tipo
                ,S.Estado AS Estado_SAT
                ,S.Fecha AS Fecha_Ultimo_Intento
                ,L.Fecha_Carga AS Fecha_Error_BC
                ,L.Tipo_Carga AS Accion_BC
                ,(CASE 
                    WHEN CAST(L.Atributos AS VARCHAR(MAX)) LIKE '%is not in inventory%' THEN 'SIN STOCK EN ORIGEN'
                    WHEN CAST(L.Atributos AS VARCHAR(MAX)) LIKE '%We can''t save your changes right now%' THEN 'BLOQUEO TEMP (LOCKING)'
                    ELSE 'OTRO ERROR'
                  END) AS Motivo_Principal
                ,CAST(L.Atributos AS VARCHAR(MAX)) AS Atributos
                ,(CASE WHEN S.Estado = 'OK' THEN 1 ELSE 0 END) AS Is_Fake_OK
            FROM LatestLogs L
            INNER JOIN LatestStatus S 
                ON S.Traspaso = L.Traspaso
                AND S.rn_s = 1
                AND (
                    (L.Tipo_Carga LIKE '%Despacho%' AND S.Tipo = 'D') OR
                    (L.Tipo_Carga LIKE '%Recepcion%' AND S.Tipo = 'R')
                )
            WHERE L.rn_l = 1 
              AND S.Estado <> 'TERMINADO'
              AND (
                    CAST(L.Atributos AS VARCHAR(MAX)) LIKE '%is not in inventory%' OR
                    CAST(L.Atributos AS VARCHAR(MAX)) LIKE '%We can''t save your changes right now%'
              )
            ORDER BY L.Fecha_Carga DESC;
        `;

        const result = await pool.request().query(query);

        return NextResponse.json({
            success: true,
            data: result.recordset
        });

    } catch (error: any) {
        console.error("Error al obtener errores recientes:", error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
