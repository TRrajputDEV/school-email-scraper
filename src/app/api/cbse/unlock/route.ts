import { NextResponse } from "next/server";
import {
  createCBSESessionToken,
  getCBSECookieName,
  getCBSESessionMaxAge,
  verifyCBSEAccessCode,
} from "@/lib/security/cbseGuard";

export const runtime = "nodejs";

type UnlockRequest = {
  code?: unknown;
};

export async function POST(request: Request) {
  let body: UnlockRequest;

  try {
    body = (await request.json()) as UnlockRequest;
  } catch {
    return NextResponse.json(
      {
        error: "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  if (
    typeof body.code !== "string" ||
    !body.code.trim()
  ) {
    return NextResponse.json(
      {
        error: "Access code is required.",
      },
      { status: 400 },
    );
  }

  let valid = false;

  try {
    valid = verifyCBSEAccessCode(body.code);
  } catch (error) {
    console.error(
      "[cbse/unlock] access code verification failed",
      error,
    );

    return NextResponse.json(
      {
        error: "CBSE access is not configured correctly.",
      },
      { status: 500 },
    );
  }

  if (!valid) {
    return NextResponse.json(
      {
        error: "Invalid CBSE access code.",
      },
      { status: 401 },
    );
  }

  const token = createCBSESessionToken();

  const response = NextResponse.json({
    success: true,
    expiresIn: getCBSESessionMaxAge(),
  });

  response.cookies.set({
    name: getCBSECookieName(),
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: getCBSESessionMaxAge(),
  });

  return response;
}