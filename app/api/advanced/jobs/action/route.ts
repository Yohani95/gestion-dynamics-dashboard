import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool } from "@/lib/db";
import {
  ensureAdvancedTables,
  getWhitelistMap,
  insertAdvancedAudit,
  insertAdvancedAuditSafe,
  resolveInstanceKey,
} from "@/lib/advancedControl";
import { getJobRunningState } from "@/lib/advancedJobs";
import { getAdminSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

type ActionType = "START" | "STOP" | "RETRY" | "ENABLE" | "DISABLE";

const ALLOWED_ACTIONS = new Set<ActionType>([
  "START",
  "STOP",
  "RETRY",
  "ENABLE",
  "DISABLE",
]);

async function waitForStopIfNeeded(
  pool: sql.ConnectionPool,
  jobName: string,
  maxAttempts = 12,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const isRunning = await getJobRunningState(pool, jobName);
    if (!isRunning) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function actionRequiresStartPermission(action: ActionType) {
  return action === "START" || action === "RETRY";
}

function actionRequiresStopPermission(action: ActionType) {
  return action === "STOP";
}

function actionRequiresEnablePermission(action: ActionType) {
  return action === "ENABLE";
}

function actionRequiresDisablePermission(action: ActionType) {
  return action === "DISABLE";
}

export async function POST(request: NextRequest) {
  const instance = resolveInstanceKey(request.headers.get("x-instance"));

  let payload: {
    jobName?: string;
    action?: ActionType;
    reason?: string;
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON invalido en cuerpo de solicitud." },
      { status: 400 },
    );
  }

  const jobName = payload.jobName?.trim() ?? "";
  const action = payload.action?.toUpperCase() as ActionType | undefined;
  const reason = payload.reason?.trim() ?? "";

  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: null,
      action: action ?? "UNKNOWN",
      targetType: "JOB",
      targetName: jobName || "UNKNOWN",
      result: "DENIED",
      detail: "Accion denegada: sesion de administrador requerida.",
    });

    return NextResponse.json(
      {
        success: false,
        error: "Sesion de administrador requerida.",
        auditId,
      },
      { status: 401 },
    );
  }

  if (adminSession.role !== "ADMIN") {
    const auditId = await insertAdvancedAuditSafe({
      instance,
      userApp: adminSession.username,
      action: action ?? "UNKNOWN",
      targetType: "JOB",
      targetName: jobName || "UNKNOWN",
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

  const userApp = adminSession.username;

  if (!jobName || !action || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Body requerido: { jobName, action: START|STOP|RETRY|ENABLE|DISABLE, reason? }",
      },
      { status: 400 },
    );
  }

  try {
    const pool = await getPool(instance);
    await ensureAdvancedTables(pool);

    const whitelist = await getWhitelistMap(pool, instance, "JOB");
    const permissions = whitelist.get(jobName.toLowerCase()) ?? {
      canStart: false,
      canStop: false,
      canEnable: false,
      canDisable: false,
    };

    if (actionRequiresStartPermission(action) && !permissions.canStart) {
      const auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "DENIED",
        detail: reason
          ? `Accion denegada por whitelist. Motivo usuario: ${reason}`
          : "Accion denegada por whitelist.",
      });

      return NextResponse.json(
        {
          success: false,
          error: "El job no tiene permiso para iniciar/reintentar.",
          auditId,
        },
        { status: 403 },
      );
    }

    if (actionRequiresStopPermission(action) && !permissions.canStop) {
      const auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "DENIED",
        detail: reason
          ? `Accion denegada por whitelist. Motivo usuario: ${reason}`
          : "Accion denegada por whitelist.",
      });

      return NextResponse.json(
        {
          success: false,
          error: "El job no tiene permiso para detenerse.",
          auditId,
        },
        { status: 403 },
      );
    }

    if (actionRequiresEnablePermission(action) && !permissions.canEnable) {
      const auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "DENIED",
        detail: reason
          ? `Accion denegada por whitelist. Motivo usuario: ${reason}`
          : "Accion denegada por whitelist.",
      });

      return NextResponse.json(
        {
          success: false,
          error: "El job no tiene permiso para habilitarse.",
          auditId,
        },
        { status: 403 },
      );
    }

    if (actionRequiresDisablePermission(action) && !permissions.canDisable) {
      const auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "DENIED",
        detail: reason
          ? `Accion denegada por whitelist. Motivo usuario: ${reason}`
          : "Accion denegada por whitelist.",
      });

      return NextResponse.json(
        {
          success: false,
          error: "El job no tiene permiso para deshabilitarse.",
          auditId,
        },
        { status: 403 },
      );
    }

    const existsResult = await pool
      .request()
      .input("JobName", sql.NVarChar(256), jobName)
      .query<{ ExistsJob: number; IsEnabled: boolean }>(`
        SELECT
          CASE WHEN EXISTS (
            SELECT 1 FROM msdb.dbo.sysjobs WHERE name = @JobName
          ) THEN 1 ELSE 0 END AS ExistsJob,
          CAST(ISNULL((
            SELECT TOP 1 enabled FROM msdb.dbo.sysjobs WHERE name = @JobName
          ), 0) AS bit) AS IsEnabled;
      `);

    if (!existsResult.recordset[0] || existsResult.recordset[0].ExistsJob !== 1) {
      const auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "FAILED",
        detail: reason
          ? `Job no encontrado. Motivo usuario: ${reason}`
          : "Job no encontrado.",
      });

      return NextResponse.json(
        {
          success: false,
          error: "No se encontro el job solicitado.",
          auditId,
        },
        { status: 404 },
      );
    }

    const isEnabled = Boolean(existsResult.recordset[0].IsEnabled);

    if (action === "ENABLE") {
      if (isEnabled) {
        const auditId = await insertAdvancedAudit(pool, {
          instance,
          userApp,
          action,
          targetType: "JOB",
          targetName: jobName,
          result: "FAILED",
          detail: reason
            ? `Enable solicitado pero el job ya estaba habilitado. Motivo usuario: ${reason}`
            : "Enable solicitado pero el job ya estaba habilitado.",
        });

        return NextResponse.json(
          {
            success: false,
            error: "El job ya se encuentra habilitado.",
            auditId,
          },
          { status: 409 },
        );
      }

      await pool
        .request()
        .input("job_name", sql.NVarChar(256), jobName)
        .input("enabled", sql.TinyInt, 1)
        .execute("msdb.dbo.sp_update_job");

      const auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "SUCCESS",
        detail: reason ? `Motivo usuario: ${reason}` : null,
      });

      return NextResponse.json({
        success: true,
        message: "Job habilitado correctamente.",
        auditId,
      });
    }

    if (action === "DISABLE") {
      if (!isEnabled) {
        const auditId = await insertAdvancedAudit(pool, {
          instance,
          userApp,
          action,
          targetType: "JOB",
          targetName: jobName,
          result: "FAILED",
          detail: reason
            ? `Disable solicitado pero el job ya estaba deshabilitado. Motivo usuario: ${reason}`
            : "Disable solicitado pero el job ya estaba deshabilitado.",
        });

        return NextResponse.json(
          {
            success: false,
            error: "El job ya se encuentra deshabilitado.",
            auditId,
          },
          { status: 409 },
        );
      }

      await pool
        .request()
        .input("job_name", sql.NVarChar(256), jobName)
        .input("enabled", sql.TinyInt, 0)
        .execute("msdb.dbo.sp_update_job");

      const auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "SUCCESS",
        detail: reason ? `Motivo usuario: ${reason}` : null,
      });

      return NextResponse.json({
        success: true,
        message: "Job deshabilitado correctamente.",
        auditId,
      });
    }

    if (!isEnabled && (action === "START" || action === "RETRY")) {
      const auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "FAILED",
        detail: reason
          ? `Accion sobre job deshabilitado. Motivo usuario: ${reason}`
          : "Accion sobre job deshabilitado.",
      });

      return NextResponse.json(
        {
          success: false,
          error: "El job esta deshabilitado. Habilitalo antes de iniciar o reintentar.",
          auditId,
        },
        { status: 409 },
      );
    }

    if (action === "START") {
      await pool
        .request()
        .input("job_name", sql.NVarChar(256), jobName)
        .execute("msdb.dbo.sp_start_job");

      const auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "SUCCESS",
        detail: reason ? `Motivo usuario: ${reason}` : null,
      });

      return NextResponse.json({
        success: true,
        message: "Job iniciado correctamente.",
        auditId,
      });
    }

    if (action === "STOP") {
      const isRunning = await getJobRunningState(pool, jobName);
      if (!isRunning) {
        const auditId = await insertAdvancedAudit(pool, {
          instance,
          userApp,
          action,
          targetType: "JOB",
          targetName: jobName,
          result: "FAILED",
          detail: reason
            ? `Stop solicitado pero el job no estaba en ejecucion. Motivo usuario: ${reason}`
            : "Stop solicitado pero el job no estaba en ejecucion.",
        });

        return NextResponse.json(
          {
            success: false,
            error: "El job no se encuentra en ejecucion.",
            auditId,
          },
          { status: 409 },
        );
      }

      await pool
        .request()
        .input("job_name", sql.NVarChar(256), jobName)
        .execute("msdb.dbo.sp_stop_job");

      const auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "SUCCESS",
        detail: reason ? `Motivo usuario: ${reason}` : null,
      });

      return NextResponse.json({
        success: true,
        message: "Job detenido correctamente.",
        auditId,
      });
    }

    const isRunning = await getJobRunningState(pool, jobName);
    if (isRunning) {
      if (!permissions.canStop) {
        const auditId = await insertAdvancedAudit(pool, {
          instance,
          userApp,
          action,
          targetType: "JOB",
          targetName: jobName,
          result: "DENIED",
          detail: reason
            ? `Retry denegado: requiere stop y no esta permitido. Motivo usuario: ${reason}`
            : "Retry denegado: requiere stop y no esta permitido.",
        });

        return NextResponse.json(
          {
            success: false,
            error: "Retry requiere permiso de stop cuando el job esta en ejecucion.",
            auditId,
          },
          { status: 403 },
        );
      }

      await pool
        .request()
        .input("job_name", sql.NVarChar(256), jobName)
        .execute("msdb.dbo.sp_stop_job");

      const stopped = await waitForStopIfNeeded(pool, jobName);
      if (!stopped) {
        const auditId = await insertAdvancedAudit(pool, {
          instance,
          userApp,
          action,
          targetType: "JOB",
          targetName: jobName,
          result: "FAILED",
          detail: reason
            ? `No fue posible detener el job previo a retry. Motivo usuario: ${reason}`
            : "No fue posible detener el job previo a retry.",
        });

        return NextResponse.json(
          {
            success: false,
            error: "No fue posible detener el job antes de reintentar.",
            auditId,
          },
          { status: 409 },
        );
      }
    }

    await pool
      .request()
      .input("job_name", sql.NVarChar(256), jobName)
      .execute("msdb.dbo.sp_start_job");

    const auditId = await insertAdvancedAudit(pool, {
      instance,
      userApp,
      action,
      targetType: "JOB",
      targetName: jobName,
      result: "SUCCESS",
      detail: reason ? `Motivo usuario: ${reason}` : null,
    });

    return NextResponse.json({
      success: true,
      message: "Job re-ejecutado correctamente.",
      auditId,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    let auditId = 0;

    try {
      const pool = await getPool(instance);
      await ensureAdvancedTables(pool);
      auditId = await insertAdvancedAudit(pool, {
        instance,
        userApp,
        action,
        targetType: "JOB",
        targetName: jobName,
        result: "FAILED",
        detail: reason
          ? `Error interno: ${err.message}. Motivo usuario: ${reason}`
          : `Error interno: ${err.message}`,
      });
    } catch (auditError) {
      const inner = auditError instanceof Error ? auditError : new Error(String(auditError));
      console.error("[API advanced/jobs/action] error de auditoria:", inner.message);
    }

    console.error("[API advanced/jobs/action]", err.message);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        auditId,
      },
      { status: 500 },
    );
  }
}
