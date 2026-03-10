import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import sql from "mssql";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id, accion } = body;

        if (!id || !accion) {
            return NextResponse.json({ success: false, error: "ID y acción son requeridos" }, { status: 400 });
        }

        const nuevoEstado = accion === "REINTENTAR" ? "PENDIENTE" : "TERMINADO";

        const pool = await getPool();
        const result = await pool.request()
            .input("Id", sql.UniqueIdentifier, id)
            .input("Estado", sql.VarChar(20), nuevoEstado)
            .query(`
        UPDATE Ges_EstadoEnvioTraspasos 
        SET Estado = @Estado 
        WHERE Id_EstadoEnvioTraspasos = @Id
      `);

        if (result.rowsAffected[0] === 0) {
            return NextResponse.json({ success: false, error: "No se encontró el registro" }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: `Estado actualizado a ${nuevoEstado}` });

    } catch (error) {
        console.error("Error en POST /api/transferencias/estados/accion:", error);
        return NextResponse.json(
            { success: false, error: "Error al ejecutar la acción sobre la transferencia" },
            { status: 500 }
        );
    }
}
