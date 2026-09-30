import { NextResponse } from "next/server";

import { scrapeCBSESchools } from "@/lib/directories/cbse";
import type { SchoolBoard } from "@/lib/directories/types";

export const runtime = "nodejs";

const MAX_IMPORT_LIMIT = 50_000;

type ImportRequest = {
  board?: unknown;
  limit?: unknown;
  randomize?: unknown;
  excludeSchoolCodes?: unknown;
};

export async function POST(request: Request) {
  let body: ImportRequest;

  try {
    body = (await request.json()) as ImportRequest;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const board = normalizeBoard(body.board);
  const limit = validateLimit(body.limit);
  const excludeSchoolCodes = normalizeExcludedCodes(body.excludeSchoolCodes);

  if (!board) {
    return NextResponse.json(
      { error: "board must be CBSE." },
      { status: 400 },
    );
  }

  if (limit === undefined) {
    return NextResponse.json(
      {
        error: `limit must be an integer between 0 and ${MAX_IMPORT_LIMIT}.`,
      },
      { status: 400 },
    );
  }

  try {
    const schools = await scrapeCBSESchools(limit, {
      randomize: body.randomize === true,
      excludeSchoolCodes,
    });

    return NextResponse.json({
      board,
      count: schools.length,
      schools,
    });
  } catch (error) {
    console.error(`[directories/import] ${board} scraper failed`, error);

    return NextResponse.json(
      { error: `Unable to import schools from the ${board} directory.` },
      { status: 502 },
    );
  }
}

function normalizeExcludedCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((code): code is string => typeof code === "string");
}

function normalizeBoard(value: unknown): SchoolBoard | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const board = value.trim().toUpperCase();

  return board === "CBSE" ? board : undefined;
}

function validateLimit(value: unknown): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_IMPORT_LIMIT
  ) {
    return undefined;
  }

  return value;
}
