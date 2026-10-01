import { NextResponse } from "next/server";

import { getFeaturedProducts, loadCatalogue, type Product } from "@/lib/catalog";
import {
  renderEmailTemplate,
  type EmailTemplateData,
  type EmailTemplateName,
} from "@/lib/email/renderEmailTemplate";

export const runtime = "nodejs";

type PreviewRequest = {
  templateName?: unknown;
  data?: unknown;
};

const TEMPLATE_NAMES: EmailTemplateName[] = [
  "school-partnership",
  "product-catalogue",
  "educational-resources",
];

export async function POST(request: Request) {
  let body: PreviewRequest;

  try {
    body = (await request.json()) as PreviewRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.templateName !== "string" || !TEMPLATE_NAMES.includes(body.templateName as EmailTemplateName)) {
    return NextResponse.json({ error: "Unknown email template." }, { status: 400 });
  }

  const input = isRecord(body.data) ? body.data : {};
  let products: Product[] = [];

  try {
    products = getFeaturedProducts(await loadCatalogue(), 4);
  } catch {
    products = [];
  }

  const data: EmailTemplateData = {
    subject: stringValue(input.subject, "Educational resources for your school"),
    fromName: optionalString(input.fromName),
    fromEmail: optionalString(input.fromEmail),
    title: stringValue(input.title, "Resources for your school community"),
    intro: stringValue(input.intro, "Explore practical products and resources designed for schools.") ,
    body: stringValue(input.body, "We would be happy to share more information and discuss what may be useful for your school.") ,
    recipientName: optionalString(input.recipientName),
    schoolName: optionalString(input.schoolName),
    previewText: optionalString(input.previewText),
    buttonText: optionalString(input.buttonText) ?? "View Full Catalogue",
    buttonUrl: optionalString(input.buttonUrl) ?? "/catalog",
    catalogueUrl: "/catalog",
    unsubscribeUrl: optionalString(input.unsubscribeUrl),
    products,
  };

  try {
    return NextResponse.json(await renderEmailTemplate(body.templateName as EmailTemplateName, data));
  } catch (error) {
    console.error("[email/preview] Could not render template", error);
    return NextResponse.json({ error: "Could not render email preview." }, { status: 500 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}
