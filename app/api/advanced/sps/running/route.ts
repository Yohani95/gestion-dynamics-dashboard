import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool } from "@/lib/db";
import { resolveInstanceKey } from "@/lib/advancedControl";

export const dynamic = "force-dynamic";

type RunningSpRow = {
  SessionId: number;
  SpName: string | null;
  StartedAt: Date | null;
  ElapsedSec: number;
  DatabaseName: string | null;
  HostName: string | null;
  ProgramName: string | null;
  LoginName: string | null;
  Status: string | null;
  Command: string | null;
  CommandText: string | null;
};

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function toIso(value: Date | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractProcedureName(commandText: string | null) {
  if (!commandText) return null;
  const normalized = commandText.replace(/\s+/g, " ").trim();
  const match = /^exec(?:ute)?\s+([^\s(]+)/i.exec(normalized);
  return match?.[1] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minDurationSec = parseInteger(searchParams.get("minDurationSec"), 0, 0, 86400);

    const instance = resolveInstanceKey(request.headers.get("x-instance"));
    const pool = await getPool(instance);

    const result = await pool
      .request()
      .input("MinDurationSec", sql.Int, minDurationSec)
      .query<RunningSpRow>(`
        SELECT
          r.session_id AS SessionId,
          NULLIF(
            CONCAT(
              OBJECT_SCHEMA_NAME(st.objectid, st.dbid),
              '.',
              OBJECT_NAME(st.objectid, st.dbid)
            ),
            '.'
          ) AS SpName,
          r.start_time AS StartedAt,
          DATEDIFF(SECOND, r.start_time, GETDATE()) AS ElapsedSec,
          DB_NAME(r.database_id) AS DatabaseName,
          s.host_name AS HostName,
          s.program_name AS ProgramName,
          s.login_name AS LoginName,
          r.status AS Status,
          r.command AS Command,
          LEFT(REPLACE(REPLACE(st.text, CHAR(13), ' '), CHAR(10), ' '), 400) AS CommandText
        FROM sys.dm_exec_requests r
        INNER JOIN sys.dm_exec_sessions s ON s.session_id = r.session_id
        CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
        WHERE r.session_id <> @@SPID
          AND r.start_time IS NOT NULL
          AND DATEDIFF(SECOND, r.start_time, GETDATE()) >= @MinDurationSec
          AND (
            r.command = 'EXECUTE'
            OR st.objectid IS NOT NULL
            OR LOWER(LTRIM(st.text)) LIKE 'exec%'
            OR LOWER(LTRIM(st.text)) LIKE 'execute%'
          )
        ORDER BY ElapsedSec DESC, r.start_time ASC;
      `);

    const data = result.recordset.map((row) => ({
      sessionId: row.SessionId,
      spName: row.SpName ?? extractProcedureName(row.CommandText) ?? "(no identificado)",
      startedAt: toIso(row.StartedAt),
      elapsedSec: row.ElapsedSec,
      databaseName: row.DatabaseName,
      hostName: row.HostName,
      programName: row.ProgramName,
      loginName: row.LoginName,
      status: row.Status,
      command: row.Command,
      commandText: row.CommandText,
    }));

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[API advanced/sps/running]", err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
