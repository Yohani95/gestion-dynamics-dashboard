import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionFromRequest, toPublicSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getAdminSessionFromRequest(request);
  return NextResponse.json({
    success: true,
    ...toPublicSession(session),
  });
}

