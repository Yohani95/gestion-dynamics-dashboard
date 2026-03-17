import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool } from "@/lib/db";
import { getAdminSessionFromRequest } from "@/lib/auth";
import { insertAdvancedAuditSafe } from "@/lib/advancedControl";
import { resolveInstanceId } from "@/lib/instances";

export const dynamic = "force-dynamic";

type TransferAction = "REINTENTAR" | "TERMINAR";

export async function POST(request: NextRequest) {
  const instance = resolveInstanceId(request.headers.get("x-instance"));

  let body: {
    id?: string;
    accion?: TransferAction;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON invalido. Esperado: { id, accion }." },
      { status: 400 },
    );
  }

  const id = body.id?.trim() ?? "";
  const accion = body.accion;
  const actionName = `TRANSFER_${accion ?? "UNKNOWN"}`;

  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: null,
      action: actionName,
      targetType: "TRASPASO",
      targetName: id || "UNKNOWN",
      result: "DENIED",
      detail: "Accion denegada: sesion de administrador requerida.",
    });

    return NextResponse.json(
      { success: false, error: "Sesion de administrador requerida.", auditId },
      { status: 401 },
    );
  }

  if (adminSession.role !== "ADMIN") {
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminSession.username,
      action: actionName,
      targetType: "TRASPASO",
      targetName: id || "UNKNOWN",
      result: "DENIED",
      detail: "Accion denegada: rol sin privilegios de administrador.",
    });

    return NextResponse.json(
      {
        success: false,
        error: "El usuario no tiene permisos para ejecutar acciones.",
        auditId,
      },
      { status: 403 },
    );
  }

  if (!id || (accion !== "REINTENTAR" && accion !== "TERMINAR")) {
    return NextResponse.json(
      { success: false, error: "ID y accion valida son requeridos." },
      { status: 400 },
    );
  }

  const nuevoEstado = accion === "REINTENTAR" ? "PENDIENTE" : "TERMINADO";

  try {
    const pool = await getPool(instance);
    const result = await pool
      .request()
      .input("Id", sql.UniqueIdentifier, id)
      .input("Estado", sql.VarChar(20), nuevoEstado)
      .query(`
        UPDATE Ges_EstadoEnvioTraspasos
        SET Estado = @Estado
        WHERE Id_EstadoEnvioTraspasos = @Id;
      `);

    if (result.rowsAffected[0] === 0) {
      const auditId = await insertAdvancedAuditSafe({
        instance,
        userApp: adminSession.username,
        action: actionName,
        targetType: "TRASPASO",
        targetName: id,
        result: "FAILED",
        detail: "No se encontro el registro solicitado.",
      });

      return NextResponse.json(
        { success: false, error: "No se encontro el registro.", auditId },
        { status: 404 },
      );
    }

    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminSession.username,
      action: actionName,
      targetType: "TRASPASO",
      targetName: id,
      result: "SUCCESS",
      detail: `Estado actualizado a ${nuevoEstado}.`,
    });

    return NextResponse.json({
      success: true,
      message: `Estado actualizado a ${nuevoEstado}`,
      auditId,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminSession.username,
      action: actionName,
      targetType: "TRASPASO",
      targetName: id,
      result: "FAILED",
      detail: `Error interno: ${err.message}`,
    });

    console.error("[API transferencias/estados/accion]", err.message);
    return NextResponse.json(
      {
        success: false,
        error: "Error al ejecutar la accion sobre la transferencia.",
        auditId,
      },
      { status: 500 },
    );
  }
}
