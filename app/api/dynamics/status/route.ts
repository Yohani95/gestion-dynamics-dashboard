import { NextResponse } from "next/server";
import { getDynamicsEnvStatus } from "@/lib/dynamicsEnv";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getDynamicsEnvStatus();
  return NextResponse.json(status, { status: status.configurado ? 200 : 503 });
}
