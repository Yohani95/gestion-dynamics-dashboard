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

    const snapshot = await getAdvancedJobsSnapshot({
      instanceHeader: request.headers.get("x-instance"),
      status: searchParams.get("status"),
      search: searchParams.get("search"),
      limit: parseInteger(searchParams.get("limit"), 50, 1, 500),
      page: parseInteger(searchParams.get("page"), 1, 1, 100000),
      longRunningMin: parseInteger(searchParams.get("longRunningMin"), 30, 1, 180),
    });

    return NextResponse.json({
      success: true,
      data: snapshot.jobs,
      filteredCount: snapshot.filteredCount,
      totalCount: snapshot.totalCount,
      page: snapshot.page,
      pageSize: snapshot.pageSize,
      totalPages: snapshot.totalPages,
      kpis: snapshot.kpis,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[API advanced/jobs]", err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
