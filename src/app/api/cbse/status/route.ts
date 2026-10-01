import { NextResponse } from "next/server";
import { isCBSEAccessGranted } from "@/lib/security/cbseGuard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json({
    unlocked: isCBSEAccessGranted(request),
  });
}