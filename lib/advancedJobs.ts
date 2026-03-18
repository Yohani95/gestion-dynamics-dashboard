import sql from "mssql";
import { getPool } from "@/lib/db";
import {
  ensureAdvancedTables,
  getWhitelistMap,
  resolveInstanceKey,
} from "@/lib/advancedControl";

export type AdvancedJobStatus =
  | "RUNNING"
  | "LONG_RUNNING"
  | "FAILED"
  | "SUCCEEDED"
  | "DISABLED"
  | "IDLE";

export type AdvancedLastRunOutcome =
  | "FAILED"
  | "SUCCEEDED"
  | "RETRY"
  | "CANCELED"
  | "UNKNOWN"
  | null;

export type AdvancedJobItem = {
  name: string;
  isRunning: boolean;
  isLongRunning: boolean;
  status: AdvancedJobStatus;
  isEnabled: boolean;
  isFailed24h: boolean;
  startedAt: string | null;
  currentRunSec: number | null;
  lastRunAt: string | null;
  lastRunOutcome: AdvancedLastRunOutcome;
  lastRunMessage: string | null;
  lastDurationSec: number | null;
  nextRunAt: string | null;
  canStart: boolean;
  canStop: boolean;
  canEnable: boolean;
  canDisable: boolean;
};

export type AdvancedJobsKpis = {
  running: number;
  failed24h: number;
  longRunning: number;
  totalJobs: number;
};

export type AdvancedJobsSnapshot = {
  jobs: AdvancedJobItem[];
  filteredCount: number;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  kpis: AdvancedJobsKpis;
};

type AdvancedJobsBaseSnapshot = {
  jobs: AdvancedJobItem[];
  kpis: AdvancedJobsKpis;
};

type AdvancedJobsCacheEntry = {
  expiresAt: number;
  data: AdvancedJobsBaseSnapshot;
};

type SqlJobRow = {
  Name: string;
  IsEnabled: boolean;
  IsRunning: boolean;
  IsFailed24h: boolean;
  StartedAt: string | null;
  CurrentRunSeconds: number | null;
  LastRunAt: string | null;
  LastRunStatus: number | null;
  LastRunMessage: string | null;
  LastRunSeconds: number | null;
  NextRunAt: string | null;
};

const ADVANCED_JOBS_CACHE_TTL_MS = (() => {
  const parsed = Number.parseInt(process.env.ADVANCED_JOBS_CACHE_TTL_MS ?? "15000", 10);
  if (Number.isNaN(parsed)) return 15_000;
  return Math.min(Math.max(parsed, 1_000), 120_000);
})();

const advancedJobsCache = new Map<string, AdvancedJobsCacheEntry>();
const advancedJobsInFlight = new Map<string, Promise<AdvancedJobsBaseSnapshot>>();
const advancedJobsCacheVersionByInstance = new Map<string, number>();

function getSnapshotCacheKey(instance: string, longRunningMin: number) {
  const version = advancedJobsCacheVersionByInstance.get(instance) ?? 0;
  return `${instance}:${version}:${longRunningMin}`;
}

export function invalidateAdvancedJobsCache(instanceHeader?: string | null) {
  const instance = resolveInstanceKey(instanceHeader);
  const nextVersion = (advancedJobsCacheVersionByInstance.get(instance) ?? 0) + 1;
  advancedJobsCacheVersionByInstance.set(instance, nextVersion);

  const prefix = `${instance}:`;

  for (const key of advancedJobsCache.keys()) {
    if (key.startsWith(prefix)) {
      advancedJobsCache.delete(key);
    }
  }
}

function rowPriority(row: SqlJobRow) {
  let score = 0;
  if (row.IsRunning) score += 100;
  if (row.StartedAt) score += 10;
  if (row.LastRunAt) score += 1;
  return score;
}

function normalizeSqlDateTime(value: string | null) {
  if (!value) return null;
  return value.trim();
}

function normalizeSqlMessage(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function getLastRunOutcome(status: number | null): AdvancedLastRunOutcome {
  switch (status) {
    case 0:
      return "FAILED";
    case 1:
      return "SUCCEEDED";
    case 2:
      return "RETRY";
    case 3:
      return "CANCELED";
    case 4:
      return "UNKNOWN";
    default:
      return null;
  }
}

function deriveStatus(job: {
  isEnabled: boolean;
  isRunning: boolean;
  isLongRunning: boolean;
  lastRunOutcome: AdvancedLastRunOutcome;
}): AdvancedJobStatus {
  if (!job.isEnabled) return "DISABLED";
  if (job.isRunning && job.isLongRunning) return "LONG_RUNNING";
  if (job.isRunning) return "RUNNING";
  if (job.lastRunOutcome === "FAILED") return "FAILED";
  if (job.lastRunOutcome === "SUCCEEDED") return "SUCCEEDED";
  return "IDLE";
}

function normalizeStatusFilter(status?: string | null) {
  if (!status) return "ALL";
  const normalized = status.trim().toUpperCase();
  if (
    normalized === "RUNNING" ||
    normalized === "LONG_RUNNING" ||
    normalized === "FAILED" ||
    normalized === "SUCCEEDED" ||
    normalized === "DISABLED" ||
    normalized === "IDLE"
  ) {
    return normalized;
  }
  return "ALL";
}

function computeKpis(jobs: AdvancedJobItem[]): AdvancedJobsKpis {
  const longRunning = jobs.filter((job) => job.status === "LONG_RUNNING").length;
  const running = jobs.filter((job) => job.status === "RUNNING").length;
  const failed24h = jobs.filter((job) => job.isFailed24h).length;

  return {
    running,
    failed24h,
    longRunning,
    totalJobs: jobs.length,
  };
}

async function loadAdvancedJobsBaseSnapshot(options: {
  instance: string;
  longRunningMin: number;
}): Promise<AdvancedJobsBaseSnapshot> {
  const { instance, longRunningMin } = options;
  const pool = await getPool(instance);
  await ensureAdvancedTables(pool);

  const jobRows = await pool.request().query<SqlJobRow>(`
    WITH AgentSession AS (
      SELECT TOP 1 session_id
      FROM msdb.dbo.syssessions WITH (NOLOCK)
      ORDER BY agent_start_date DESC
    ),
    RunningSessionJobs AS (
      SELECT
        UPPER(SUBSTRING(s.program_name, CHARINDEX('0x', s.program_name), 34)) AS JobIdHex,
        MIN(r.start_time) AS RequestStartTime
      FROM sys.dm_exec_sessions s
      LEFT JOIN sys.dm_exec_requests r
        ON r.session_id = s.session_id
      WHERE s.program_name LIKE 'SQLAgent - % (Job 0x%'
        AND CHARINDEX('0x', s.program_name) > 0
      GROUP BY UPPER(SUBSTRING(s.program_name, CHARINDEX('0x', s.program_name), 34))
    ),
    CurrentActivity AS (
      SELECT
        r.job_id,
        r.start_execution_date,
        r.stop_execution_date
      FROM (
        SELECT
          ja.job_id,
          ja.start_execution_date,
          ja.stop_execution_date,
          ROW_NUMBER() OVER (
            PARTITION BY ja.job_id
            ORDER BY
              CASE
                WHEN ja.start_execution_date IS NOT NULL AND ja.stop_execution_date IS NULL THEN 0
                ELSE 1
              END,
              ISNULL(ja.start_execution_date, CONVERT(DATETIME, '19000101', 112)) DESC,
              ISNULL(ja.run_requested_date, CONVERT(DATETIME, '19000101', 112)) DESC
          ) AS rn
        FROM msdb.dbo.sysjobactivity ja WITH (NOLOCK)
        CROSS JOIN AgentSession s
        WHERE ja.session_id = s.session_id
      ) r
      WHERE r.rn = 1
    ),
    LastRun AS (
      SELECT
        h.job_id,
        h.instance_id AS LastRunInstanceId,
        LAG(h.instance_id) OVER (
          PARTITION BY h.job_id
          ORDER BY h.instance_id
        ) AS PrevRunSummaryInstanceId,
        CASE
          WHEN h.run_date = 0 THEN NULL
          ELSE msdb.dbo.agent_datetime(h.run_date, h.run_time)
        END AS LastRunAt,
        h.run_status AS LastRunStatus,
        LEFT(h.message, 800) AS LastRunMessage,
        ((h.run_duration / 10000) * 3600)
          + (((h.run_duration % 10000) / 100) * 60)
          + (h.run_duration % 100) AS LastRunSeconds,
        ROW_NUMBER() OVER (PARTITION BY h.job_id ORDER BY h.instance_id DESC) AS rn
      FROM msdb.dbo.sysjobhistory h WITH (NOLOCK)
      WHERE h.step_id = 0
    ),
    NextRun AS (
      SELECT
        js.job_id,
        MIN(n.NextRunAt) AS NextRunAt
      FROM msdb.dbo.sysjobschedules js WITH (NOLOCK)
      INNER JOIN msdb.dbo.sysschedules s WITH (NOLOCK)
        ON s.schedule_id = js.schedule_id
        AND s.enabled = 1
      CROSS APPLY (
        SELECT CASE
          WHEN js.next_run_date = 0 THEN NULL
          ELSE msdb.dbo.agent_datetime(js.next_run_date, js.next_run_time)
        END AS NextRunAt
      ) n
      WHERE n.NextRunAt IS NOT NULL
        AND n.NextRunAt >= DATEADD(MINUTE, -1, GETDATE())
      GROUP BY js.job_id
    )
    SELECT
      j.name AS Name,
      CAST(j.enabled AS bit) AS IsEnabled,
      CAST(
        CASE
          WHEN rs.JobIdHex IS NOT NULL THEN 1
          ELSE 0
        END
      AS bit) AS IsRunning,
      CAST(
        CASE
          WHEN lr.LastRunStatus = 0
            AND lr.LastRunAt >= DATEADD(HOUR, -24, GETDATE()) THEN 1
          ELSE 0
        END
      AS bit) AS IsFailed24h,
      CONVERT(
        VARCHAR(19),
        CASE
          WHEN rs.JobIdHex IS NOT NULL
            THEN COALESCE(rs.RequestStartTime, ca.start_execution_date)
          ELSE NULL
        END,
        120
      ) AS StartedAt,
      CASE
        WHEN rs.JobIdHex IS NOT NULL
          THEN DATEDIFF(
            SECOND,
            COALESCE(rs.RequestStartTime, ca.start_execution_date, GETDATE()),
            GETDATE()
          )
        ELSE NULL
      END AS CurrentRunSeconds,
      CONVERT(VARCHAR(19), lr.LastRunAt, 120) AS LastRunAt,
      lr.LastRunStatus,
      CASE
        WHEN lr.LastRunStatus = 0 THEN LEFT(
          COALESCE(
            CASE
              WHEN lse.FailedStepMessage IS NOT NULL THEN CONCAT(
                'Paso ',
                CONVERT(VARCHAR(10), lse.FailedStepId),
                CASE
                  WHEN NULLIF(LTRIM(RTRIM(lse.FailedStepName)), '') IS NOT NULL
                    THEN CONCAT(' (', lse.FailedStepName, ')')
                  ELSE ''
                END,
                ': ',
                lse.FailedStepMessage
              )
              ELSE NULL
            END,
            lr.LastRunMessage
          ),
          800
        )
        ELSE LEFT(lr.LastRunMessage, 800)
      END AS LastRunMessage,
      lr.LastRunSeconds,
      CONVERT(VARCHAR(19), nr.NextRunAt, 120) AS NextRunAt
    FROM msdb.dbo.sysjobs j WITH (NOLOCK)
    LEFT JOIN CurrentActivity ca ON ca.job_id = j.job_id
    LEFT JOIN LastRun lr ON lr.job_id = j.job_id AND lr.rn = 1
    LEFT JOIN NextRun nr ON nr.job_id = j.job_id
    OUTER APPLY (
      SELECT TOP 1
        hs.step_id AS FailedStepId,
        hs.step_name AS FailedStepName,
        hs.message AS FailedStepMessage
      FROM msdb.dbo.sysjobhistory hs WITH (NOLOCK)
      WHERE hs.job_id = j.job_id
        AND hs.step_id > 0
        AND hs.run_status = 0
        AND lr.LastRunInstanceId IS NOT NULL
        AND hs.instance_id <= lr.LastRunInstanceId
        AND (
          lr.PrevRunSummaryInstanceId IS NULL
          OR hs.instance_id > lr.PrevRunSummaryInstanceId
        )
      ORDER BY hs.instance_id DESC
    ) lse
    LEFT JOIN RunningSessionJobs rs
      ON rs.JobIdHex = UPPER(
        sys.fn_varbintohexstr(CAST(j.job_id AS VARBINARY(16)))
      )
    ORDER BY j.name ASC;
  `);

  const whitelist = await getWhitelistMap(pool, instance, "JOB");

  const uniqueRows = new Map<string, SqlJobRow>();
  for (const row of jobRows.recordset) {
    const current = uniqueRows.get(row.Name);
    if (!current || rowPriority(row) > rowPriority(current)) {
      uniqueRows.set(row.Name, row);
    }
  }

  const allJobs = Array.from(uniqueRows.values()).map((row) => {
    const currentRunSec = row.CurrentRunSeconds ?? null;
    const isRunning = Boolean(row.IsRunning);
    const isLongRunning =
      Boolean(isRunning) &&
      typeof currentRunSec === "number" &&
      currentRunSec >= longRunningMin * 60;

    const lastRunOutcome = getLastRunOutcome(row.LastRunStatus);
    const status = deriveStatus({
      isEnabled: Boolean(row.IsEnabled),
      isRunning,
      isLongRunning,
      lastRunOutcome,
    });

    const permissions = whitelist.get(row.Name.toLowerCase()) ?? {
      canStart: false,
      canStop: false,
      canEnable: false,
      canDisable: false,
    };

    return {
      name: row.Name,
      isEnabled: Boolean(row.IsEnabled),
      isRunning,
      isLongRunning,
      status,
      isFailed24h: Boolean(row.IsFailed24h),
      startedAt: normalizeSqlDateTime(row.StartedAt),
      currentRunSec,
      lastRunAt: normalizeSqlDateTime(row.LastRunAt),
      lastRunOutcome,
      lastRunMessage: normalizeSqlMessage(row.LastRunMessage),
      lastDurationSec: row.LastRunSeconds ?? null,
      nextRunAt: normalizeSqlDateTime(row.NextRunAt),
      canStart: permissions.canStart,
      canStop: permissions.canStop,
      canEnable: permissions.canEnable,
      canDisable: permissions.canDisable,
    } satisfies AdvancedJobItem;
  });

  return {
    jobs: allJobs,
    kpis: computeKpis(allJobs),
  };
}

async function getAdvancedJobsBaseSnapshot(options: {
  instance: string;
  longRunningMin: number;
  forceFresh: boolean;
}): Promise<AdvancedJobsBaseSnapshot> {
  const { instance, longRunningMin, forceFresh } = options;
  const key = getSnapshotCacheKey(instance, longRunningMin);
  const now = Date.now();

  if (!forceFresh) {
    const cached = advancedJobsCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
  }

  const inFlight = advancedJobsInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const loader = loadAdvancedJobsBaseSnapshot({ instance, longRunningMin })
    .then((data) => {
      advancedJobsCache.set(key, {
        data,
        expiresAt: Date.now() + ADVANCED_JOBS_CACHE_TTL_MS,
      });
      return data;
    })
    .finally(() => {
      advancedJobsInFlight.delete(key);
    });

  advancedJobsInFlight.set(key, loader);
  return loader;
}

export async function getAdvancedJobsSnapshot(options: {
  instanceHeader?: string | null;
  status?: string | null;
  search?: string | null;
  limit?: number | null;
  page?: number | null;
  longRunningMin?: number | null;
  forceFresh?: boolean | null;
}): Promise<AdvancedJobsSnapshot> {
  const instance = resolveInstanceKey(options.instanceHeader);
  const search = options.search?.trim().toLowerCase() ?? "";
  const statusFilter = normalizeStatusFilter(options.status);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const page = Math.max(options.page ?? 1, 1);
  const longRunningMin = Math.min(Math.max(options.longRunningMin ?? 30, 1), 180);
  const baseSnapshot = await getAdvancedJobsBaseSnapshot({
    instance,
    longRunningMin,
    forceFresh: options.forceFresh === true,
  });
  const allJobs = baseSnapshot.jobs;
  const kpis = baseSnapshot.kpis;

  const filtered = allJobs.filter((job) => {
    if (statusFilter !== "ALL" && job.status !== statusFilter) {
      return false;
    }

    if (search.length > 0 && !job.name.toLowerCase().includes(search)) {
      return false;
    }

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * limit;

  return {
    jobs: filtered.slice(startIndex, startIndex + limit),
    filteredCount: filtered.length,
    totalCount: allJobs.length,
    page: safePage,
    pageSize: limit,
    totalPages,
    kpis,
  };
}

export async function getJobRunningState(
  pool: sql.ConnectionPool,
  jobName: string,
): Promise<boolean> {
  const runningResult = await pool
    .request()
    .input("JobName", sql.NVarChar(256), jobName)
    .query<{ IsRunning: boolean }>(`
      WITH RunningSessionJobs AS (
        SELECT DISTINCT
          UPPER(SUBSTRING(s.program_name, CHARINDEX('0x', s.program_name), 34)) AS JobIdHex
        FROM sys.dm_exec_sessions s
        WHERE s.program_name LIKE 'SQLAgent - % (Job 0x%'
          AND CHARINDEX('0x', s.program_name) > 0
      )
      SELECT
      CAST(
          CASE
            WHEN rs.JobIdHex IS NOT NULL THEN 1
            ELSE 0
          END
        AS bit) AS IsRunning
      FROM msdb.dbo.sysjobs j WITH (NOLOCK)
      LEFT JOIN RunningSessionJobs rs
        ON rs.JobIdHex = UPPER(
          sys.fn_varbintohexstr(CAST(j.job_id AS VARBINARY(16)))
        )
      WHERE j.name = @JobName;
    `);

  return Boolean(runningResult.recordset[0]?.IsRunning);
}
