import ExcelJS from "exceljs";
import path from "node:path";

export type Product = {
  category?: string;
  name: string;
  description?: string;
  pdfUrl?: string;
};

export type CatalogueOptions = {
  filePath?: string;
};

const DEFAULT_CATALOGUE_PATH = path.join(
  process.cwd(),
  "public",
  "catalog",
  "product-list.xlsx",
);

export async function loadCatalogue(
  options: CatalogueOptions = {},
): Promise<Product[]> {
  const workbook = new ExcelJS.Workbook();
  const filePath = options.filePath ?? process.env.CATALOGUE_PATH ?? DEFAULT_CATALOGUE_PATH;

  await workbook.xlsx.readFile(filePath);

  const products: Product[] = [];

  for (const worksheet of workbook.worksheets) {
    const headerMap = findHeaderMap(worksheet);

    if (!headerMap.name) {
      continue;
    }

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerMap.headerRow) {
        return;
      }

      const nameColumn = headerMap.name;

      if (!nameColumn) {
        return;
      }

      const name = cellText(row.getCell(nameColumn));

      if (!name) {
        return;
      }

      const product: Product = {
        name,
        category: headerMap.category ? cellText(row.getCell(headerMap.category)) || undefined : undefined,
        description: headerMap.description ? cellText(row.getCell(headerMap.description)) || undefined : undefined,
        pdfUrl: headerMap.pdfUrl ? cellLink(row.getCell(headerMap.pdfUrl)) || undefined : undefined,
      };

      products.push(product);
    });
  }

  return products;
}

export function getFeaturedProducts(products: Product[], limit = 4): Product[] {
  return products.filter((product) => product.name.trim()).slice(0, limit);
}

type HeaderMap = {
  headerRow: number;
  category?: number;
  name?: number;
  description?: number;
  pdfUrl?: number;
};

function findHeaderMap(worksheet: ExcelJS.Worksheet): HeaderMap {
  let result: HeaderMap = { headerRow: 1 };

  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 10); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const headers: Array<{ key: string; column: number }> = [];
    row.eachCell((cell, column) => {
      const key = normalizeHeader(cell.value);

      if (key) {
        headers.push({ key, column });
      }
    });

    const name = findHeader(headers, ["name", "product", "productname", "book", "bookname", "title"]);

    if (name) {
      result = {
        headerRow: rowNumber,
        name: name.column,
        category: findHeader(headers, ["category", "group", "subject", "type"])?.column,
        description: findHeader(headers, ["description", "details", "summary", "about"])?.column,
        pdfUrl: findHeader(headers, ["pdflink", "pdfurl", "pdf", "link", "url", "cataloguelink"])?.column,
      };
      break;
    }
  }

  return result;
}

function findHeader(
  headers: Array<{ key: string; column: number }>,
  candidates: string[],
): { key: string; column: number } | undefined {
  return headers.find((header) => candidates.includes(header.key));
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object" && "result" in value) {
    return String(value.result ?? "").trim();
  }

  return String(value).trim();
}

function cellLink(cell: ExcelJS.Cell): string {
  if (typeof cell.value === "object" && cell.value !== null && "hyperlink" in cell.value) {
    return String(cell.value.hyperlink ?? "").trim();
  }

  return cellText(cell);
}
