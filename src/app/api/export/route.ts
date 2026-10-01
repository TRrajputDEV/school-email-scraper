import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ExportRow = {
  board: string;
  schoolName: string;
  affiliationNumber?: string;
  schoolCode?: string;
  state?: string;
  district?: string;
  city?: string;
  website: string;
  email: string;
  sourcePage: string;
  status: string;
};

type ExportRequest = {
  results?: unknown;
};

const COLUMNS = [
  { header: "Board", key: "board", width: 12 },
  { header: "School Name", key: "schoolName", width: 32 },
  { header: "Affiliation Number / School Code", key: "schoolCode", width: 32 },
  { header: "State", key: "state", width: 20 },
  { header: "District", key: "district", width: 22 },
  { header: "City", key: "city", width: 20 },
  { header: "Website", key: "website", width: 36 },
  { header: "Email", key: "email", width: 32 },
  { header: "Source Page", key: "sourcePage", width: 42 },
  { header: "Status", key: "status", width: 14 },
];

export async function POST(request: Request) {
  let body: ExportRequest;

  try {
    body = (await request.json()) as ExportRequest;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const results = parseExportRows(body.results);

  if (!results) {
    return NextResponse.json(
      { error: "results must be an array of scraped school results." },
      { status: 400 },
    );
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("School Emails");

    worksheet.columns = COLUMNS;
    worksheet.addRows(results.map((result) => ({
      board: result.board,
      schoolName: result.schoolName,
      schoolCode: result.affiliationNumber || result.schoolCode || "",
      state: result.state || "",
      district: result.district || "",
      city: result.city || "",
      website: result.website,
      email: result.email === "-" ? "" : result.email,
      sourcePage: result.sourcePage === "-" ? "" : result.sourcePage,
      status: normalizeStatus(result.status),
    })));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF152C43" },
    };
    headerRow.alignment = { vertical: "middle", wrapText: true };
    headerRow.height = 28;
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = {
      from: "A1",
      to: `J${Math.max(results.length + 1, 1)}`,
    };

    const workbookBuffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(workbookBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="school-emails.xlsx"',
      },
    });
  } catch (error) {
    console.error("[export] Could not generate workbook", error);

    return NextResponse.json(
      { error: "Could not generate the Excel file." },
      { status: 500 },
    );
  }
}

function parseExportRows(value: unknown): ExportRow[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const rows: ExportRow[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return undefined;
    }

    if (
      typeof item.board !== "string" ||
      typeof item.schoolName !== "string" ||
      typeof item.website !== "string" ||
      typeof item.email !== "string" ||
      typeof item.sourcePage !== "string" ||
      typeof item.status !== "string"
    ) {
      return undefined;
    }

    rows.push({
      board: item.board,
      schoolName: item.schoolName,
      affiliationNumber: optionalString(item.affiliationNumber),
      schoolCode: optionalString(item.schoolCode),
      state: optionalString(item.state),
      district: optionalString(item.district),
      city: optionalString(item.city),
      website: item.website,
      email: item.email,
      sourcePage: item.sourcePage,
      status: item.status,
    });
  }

  return rows;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeStatus(status: string): string {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");

  if (normalized === "success") {
    return "success";
  }

  if (normalized === "no_email") {
    return "no_email";
  }

  if (normalized === "failed") {
    return "failed";
  }

  if (normalized === "partial") {
    return "partial";
  }

  return normalized;
}
