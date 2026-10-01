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

type RenderRequest = {
  template?: unknown;
  subject?: unknown;
  preheader?: unknown;
  headline?: unknown;
  intro?: unknown;
  body?: unknown;
  ctaText?: unknown;
  ctaUrl?: unknown;
  fromName?: unknown;
  fromEmail?: unknown;
};

export async function POST(request: Request) {
  let body: RenderRequest;
  try {
    body = (await request.json()) as RenderRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const template = typeof body.template === "string" && VALID_TEMPLATES.includes(body.template as EmailTemplateName)
    ? (body.template as EmailTemplateName)
    : "educational-resources";

  let products: Product[] = [];
  try {
    products = getFeaturedProducts(await loadCatalogue(), 6);
  } catch {
    products = [];
  }

  const subject = typeof body.subject === "string" ? body.subject : "Educational resources for your school";
  const data: EmailTemplateData = {
    subject,
    previewText: typeof body.preheader === "string" ? body.preheader : "",
    title: typeof body.headline === "string" ? body.headline : "Resources for your school community",
    intro: typeof body.intro === "string" ? body.intro : "Explore practical products and resources designed for schools.",
    body: typeof body.body === "string" ? body.body : "We would be happy to share more information about what may be useful for your school.",
    fromName: typeof body.fromName === "string" ? body.fromName : undefined,
    fromEmail: typeof body.fromEmail === "string" ? body.fromEmail : undefined,
    buttonText: typeof body.ctaText === "string" ? body.ctaText : "View Full Catalogue",
    buttonUrl: typeof body.ctaUrl === "string" ? body.ctaUrl : "/catalog",
    catalogueUrl: "/catalog",
    unsubscribeUrl: "*|UNSUB|*",
    products,
  };

  try {
    const rendered = await renderEmailTemplate(template, data);
    return NextResponse.json({ html: rendered.html, subject });
  } catch (error) {
    console.error("[templates/render]", error);
    return NextResponse.json({ error: "Could not render template." }, { status: 500 });
  }
}
