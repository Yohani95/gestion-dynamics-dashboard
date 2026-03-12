import { NextResponse } from "next/server";
import sql from "mssql";
import { getPool } from "@/lib/db";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limiteStr = searchParams.get("limite") || "20";
        let limite = parseInt(limiteStr, 10);

        if (isNaN(limite) || limite < 1) limite = 20;
        if (limite > 500) limite = 500;

        const instance = request.headers.get("x-instance") || "default";
        const pool = await getPool(instance);

        const query = `
      SELECT TOP (@Limite)
         L.EstiloColor AS Traspaso
        ,L.Fecha_Carga
        ,L.Resultado
        ,L.Atributos
        ,L.Tipo_Carga
      FROM Ges_LogCargaDynamics L WITH(NOLOCK)
      WHERE L.EstiloColor LIKE 'TRANS%'
      ORDER BY L.Fecha_Carga DESC
    `;

        const requestSql = pool.request();
        requestSql.input("Limite", sql.Int, limite);

        const result = await requestSql.query(query);

        return NextResponse.json({
            success: true,
            data: result.recordset
        });

    } catch (error) {
        console.error("Error al obtener el historial de logs:", error);
        return NextResponse.json(
            { success: false, error: "Error interno del servidor al consultar los logs" },
            { status: 500 }
        );
    }
}
