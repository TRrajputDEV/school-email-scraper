import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { loadCatalogue } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET() {
  try {
    const products = await loadCatalogue();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Catalogue");

    worksheet.columns = [
      { header: "Category", key: "category", width: 24 },
      { header: "Product", key: "name", width: 40 },
      { header: "Description", key: "description", width: 60 },
      { header: "PDF URL", key: "pdfUrl", width: 55 },
    ];
    worksheet.addRows(products);
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF152C43" } };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = { from: "A1", to: `D${Math.max(products.length + 1, 1)}` };

    return new NextResponse(await workbook.xlsx.writeBuffer(), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="product-catalogue.xlsx"',
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Catalogue file is unavailable. Add public/catalog/product-list.xlsx." },
      { status: 404 },
    );
  }
}
