import { NextRequest, NextResponse } from "next/server";
import { getAdvancedJobsSnapshot } from "@/lib/advancedJobs";

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

    return NextResponse.json({
      success: true,
      failedJobs24h: snapshot.kpis.failed24h,
      longRunningJobs: snapshot.kpis.longRunning,
      totalRunningJobs: snapshot.kpis.running,
      totalJobs: snapshot.kpis.totalJobs,
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
