import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import sql from "mssql";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const estado = searchParams.get("estado") || "";
        const search = searchParams.get("search") || "";
        const limit = parseInt(searchParams.get("limit") || "50", 10);

        const pool = await getPool();
        const req = pool.request();

        let query = `
      SELECT TOP (@Limit)
        Id_EstadoEnvioTraspasos,
        Traspaso,
        Tipo,
        Estado,
        Fecha,
        Cod_Empresa
      FROM Ges_EstadoEnvioTraspasos WITH(NOLOCK)
      WHERE 1=1
    `;

        if (estado && estado !== "TODOS") {
            query += " AND Estado = @Estado";
            req.input("Estado", sql.VarChar(20), estado);
        }

        if (search) {
            query += " AND Traspaso LIKE @Search";
            req.input("Search", sql.VarChar(50), `%${search}%`);
        }

        query += " ORDER BY Fecha DESC";
        req.input("Limit", sql.Int, limit);

        const result = await req.query(query);

        return NextResponse.json({
            success: true,
            data: result.recordset
        });

    } catch (error) {
        console.error("Error en GET /api/transferencias/estados:", error);
        return NextResponse.json(
            { success: false, error: "Error al consultar estados de transferencias" },
            { status: 500 }
        );
    }
}
