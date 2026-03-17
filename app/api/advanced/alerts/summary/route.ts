import { NextRequest, NextResponse } from "next/server";
import { getAdvancedJobsSnapshot, type AdvancedJobItem } from "@/lib/advancedJobs";

export const dynamic = "force-dynamic";

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const longRunningMin = parseInteger(searchParams.get("longRunningMin"), 30, 1, 180);

    const snapshot = await getAdvancedJobsSnapshot({
      instanceHeader: request.headers.get("x-instance"),
      longRunningMin,
      limit: 500,
    });

    const failedJobsSample = snapshot.jobs
      .filter((job) => job.isFailed24h || job.status === "FAILED")
      .sort((a, b) => compareLastRunDesc(a, b))
      .slice(0, 5)
      .map((job) => job.name);

    const longRunningJobsSample = snapshot.jobs
      .filter((job) => job.isLongRunning || job.status === "LONG_RUNNING")
      .sort((a, b) => (b.currentRunSec ?? 0) - (a.currentRunSec ?? 0))
      .slice(0, 5)
      .map((job) => job.name);

    const failedToken = `${snapshot.kpis.failed24h}:${failedJobsSample.join("|")}`;
    const longToken = `${snapshot.kpis.longRunning}:${longRunningJobsSample.join("|")}`;

    return NextResponse.json({
      success: true,
      failedJobs24h: snapshot.kpis.failed24h,
      longRunningJobs: snapshot.kpis.longRunning,
      totalRunningJobs: snapshot.kpis.running,
      totalJobs: snapshot.kpis.totalJobs,
      failedJobsSample,
      longRunningJobsSample,
      failedToken,
      longToken,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[API advanced/alerts/summary]", err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

function compareLastRunDesc(a: AdvancedJobItem, b: AdvancedJobItem) {
  if (!a.lastRunAt && !b.lastRunAt) return 0;
  if (!a.lastRunAt) return 1;
  if (!b.lastRunAt) return -1;
  return b.lastRunAt.localeCompare(a.lastRunAt);
}
