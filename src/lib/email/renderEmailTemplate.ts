import ejs from "ejs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Product } from "../catalog";

export type EmailTemplateName =
  | "school-partnership"
  | "product-catalogue"
  | "educational-resources";

export type EmailTemplateData = {
  fromName?: string;
  fromEmail?: string;
  recipientName?: string;
  schoolName?: string;

  subject: string;
  previewText?: string;

  title: string;
  intro: string;
  body: string;

  buttonText?: string;
  buttonUrl?: string;

  products?: Product[];

  /**
   * Public URL of the complete catalogue.
   * This should normally be an absolute URL when the final HTML
   * is intended for Mailchimp.
   */
  catalogueUrl?: string;

  /**
   * Optional public URL for directly downloading the catalogue.
   */
  catalogueDownloadUrl?: string;

  /**
   * Optional publisher website.
   */
  websiteUrl?: string;

  /**
   * Optional logo URL.
   * Must be a publicly accessible absolute URL in production.
   */
  logoUrl?: string;

  /**
   * Optional unsubscribe URL.
   *
   * For Mailchimp templates, the EJS templates can continue to use
   * the Mailchimp merge tag *|UNSUB|* directly.
   */
  unsubscribeUrl?: string;

  /**
   * Optional company/footer text.
   */
  footerText?: string;

  /**
   * Optional label shown in the template header.
   */
  badgeText?: string;

  /**
   * Optional visual accent. EJS templates may use this value.
   */
  accentColor?: string;
};

export type RenderedEmail = {
  html: string;
  text: string;
};

const TEMPLATE_NAMES = new Set<EmailTemplateName>([
  "school-partnership",
  "product-catalogue",
  "educational-resources",
]);

const DEFAULTS = {
  fromName: "Educational Publisher",
  fromEmail: "",
  recipientName: "",
  schoolName: "",
  previewText: "",
  buttonText: "",
  buttonUrl: "",
  catalogueUrl: "",
  catalogueDownloadUrl: "",
  websiteUrl: "",
  logoUrl: "",
  unsubscribeUrl: "",
  footerText:
    "You are receiving this message as part of educational publisher outreach.",
  badgeText: "Educational Resources",
  accentColor: "#2864a3",
};

export async function renderEmailTemplate(
  templateName: EmailTemplateName,
  data: EmailTemplateData,
): Promise<RenderedEmail> {
  if (!TEMPLATE_NAMES.has(templateName)) {
    throw new Error(`Unknown email template: ${templateName}`);
  }

  const [htmlTemplate, textTemplate] = await Promise.all([
    readTemplateFile(`${templateName}.ejs`),
    readTemplateFile(`${templateName}.txt.ejs`),
  ]);

  const templateData = {
    ...data,

    fromName: cleanString(data.fromName, DEFAULTS.fromName),
    fromEmail: cleanString(data.fromEmail, DEFAULTS.fromEmail),

    recipientName: cleanString(
      data.recipientName,
      DEFAULTS.recipientName,
    ),

    schoolName: cleanString(data.schoolName, DEFAULTS.schoolName),

    subject: cleanString(data.subject),
    previewText: cleanString(
      data.previewText,
      DEFAULTS.previewText,
    ),

    title: cleanString(data.title),
    intro: cleanString(data.intro),
    body: cleanString(data.body),

    buttonText: cleanString(
      data.buttonText,
      DEFAULTS.buttonText,
    ),

    buttonUrl: cleanString(
      data.buttonUrl,
      DEFAULTS.buttonUrl,
    ),

    products: Array.isArray(data.products)
      ? data.products
      : [],

    catalogueUrl: cleanString(
      data.catalogueUrl,
      DEFAULTS.catalogueUrl,
    ),

    catalogueDownloadUrl: cleanString(
      data.catalogueDownloadUrl,
      DEFAULTS.catalogueDownloadUrl,
    ),

    websiteUrl: cleanString(
      data.websiteUrl,
      DEFAULTS.websiteUrl,
    ),

    logoUrl: cleanString(
      data.logoUrl,
      DEFAULTS.logoUrl,
    ),

    unsubscribeUrl: cleanString(
      data.unsubscribeUrl,
      DEFAULTS.unsubscribeUrl,
    ),

    footerText: cleanString(
      data.footerText,
      DEFAULTS.footerText,
    ),

    badgeText: cleanString(
      data.badgeText,
      DEFAULTS.badgeText,
    ),

    accentColor: cleanString(
      data.accentColor,
      DEFAULTS.accentColor,
    ),
  };

  const html = ejs.render(
    htmlTemplate,
    templateData,
    {
      rmWhitespace: true,
      async: false,
    },
  );

  const text = ejs.render(
    textTemplate,
    templateData,
    {
      rmWhitespace: true,
      async: false,
    },
  );

  return {
    html: normalizeRenderedHtml(html),
    text: normalizeRenderedText(text),
  };
}

async function readTemplateFile(filename: string): Promise<string> {
  const templateCandidates = [
    // Development / source tree
    path.join(
      process.cwd(),
      "src",
      "lib",
      "email",
      "templates",
      filename,
    ),

    // Fallback relative to this module
    path.resolve(
      path.dirname(filePathFromImportMetaUrl()),
      "templates",
      filename,
    ),
  ];

  let lastError: unknown;

  for (const candidate of templateCandidates) {
    try {
      return await fs.readFile(candidate, "utf8");
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Email template "${filename}" could not be found.${
      lastError instanceof Error
        ? ` ${lastError.message}`
        : ""
    }`,
  );
}

function filePathFromImportMetaUrl(): string {
  /**
   * The project currently runs on Linux/Vercel, where pathname is safe.
   * decodeURIComponent also handles escaped spaces in filesystem paths.
   */
  return decodeURIComponent(new URL(import.meta.url).pathname);
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function normalizeRenderedHtml(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeRenderedText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}