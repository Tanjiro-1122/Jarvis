import { NextRequest, NextResponse } from "next/server";
import { getBuildIntelligenceSnapshot } from "@/lib/build-intelligence";

export async function GET(req: NextRequest) {
  const projectKey = req.nextUrl.searchParams.get("projectKey") ?? "jarvis";
  const snapshot = await getBuildIntelligenceSnapshot({ projectKey });
  return NextResponse.json(snapshot);
}
