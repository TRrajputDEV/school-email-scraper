import { NextResponse } from "next/server";
import { getFeaturedProducts, loadCatalogue, type Product } from "@/lib/catalog";
import {
  renderEmailTemplate,
  type EmailTemplateData,
  type EmailTemplateName,
} from "@/lib/email/renderEmailTemplate";

export const runtime = "nodejs";

const VALID_TEMPLATES: EmailTemplateName[] = [
  "school-partnership",
  "product-catalogue",
  "educational-resources",
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const template = (searchParams.get("template") ?? "educational-resources") as EmailTemplateName;
  const subject = searchParams.get("subject") ?? "Educational resources for your school";
  const preheader = searchParams.get("preheader") ?? "";
  const headline = searchParams.get("headline") ?? "Resources for your school community";
  const intro = searchParams.get("intro") ?? "Explore practical products and resources designed for schools.";
  const body = searchParams.get("body") ?? "We would be happy to share more information about what may be useful for your school.";
  const ctaText = searchParams.get("ctaText") ?? "View Full Catalogue";
  const ctaUrl = searchParams.get("ctaUrl") ?? "/catalog";

  const safeTemplate: EmailTemplateName = VALID_TEMPLATES.includes(template) ? template : "educational-resources";

  let products: Product[] = [];
  try {
    products = getFeaturedProducts(await loadCatalogue(), 6);
  } catch {
    products = [];
  }

  const data: EmailTemplateData = {
    subject,
    previewText: preheader,
    title: headline,
    intro,
    body,
    buttonText: ctaText,
    buttonUrl: ctaUrl,
    catalogueUrl: "/catalog",
    unsubscribeUrl: "*|UNSUB|*",
    products,
  };

  try {
    const rendered = await renderEmailTemplate(safeTemplate, data);
    return new NextResponse(rendered.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": 'attachment; filename="school-email-template.html"',
      },
    });
  } catch (error) {
    console.error("[templates/download]", error);
    return NextResponse.json({ error: "Could not render template." }, { status: 500 });
  }
}
