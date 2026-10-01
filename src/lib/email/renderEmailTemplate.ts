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

  catalogueUrl?: string;
  catalogueDownloadUrl?: string;

  websiteUrl?: string;
  logoUrl?: string;

  unsubscribeUrl?: string;

  footerText?: string;
  badgeText?: string;
  accentColor?: string;
};

export type RenderedEmail = {
  html: string;
  text: string;
};

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

  unsubscribeUrl: "*|UNSUB|*",

  footerText:
    "You are receiving this message as part of educational publisher outreach.",

  badgeText: "Educational Resources",

  accentColor: "#2864a3",
};

/*
 * IMPORTANT:
 *
 * These paths are intentionally static.
 * This prevents Turbopack from tracing the entire project
 * because of dynamically constructed filesystem paths.
 */
const TEMPLATE_FILES: Record<
  EmailTemplateName,
  {
    html: string;
    text: string;
  }
> = {
  "school-partnership": {
    html: path.join(
      process.cwd(),
      "src",
      "lib",
      "email",
      "templates",
      "school-partnership.ejs",
    ),
    text: path.join(
      process.cwd(),
      "src",
      "lib",
      "email",
      "templates",
      "school-partnership.txt.ejs",
    ),
  },

  "product-catalogue": {
    html: path.join(
      process.cwd(),
      "src",
      "lib",
      "email",
      "templates",
      "product-catalogue.ejs",
    ),
    text: path.join(
      process.cwd(),
      "src",
      "lib",
      "email",
      "templates",
      "product-catalogue.txt.ejs",
    ),
  },

  "educational-resources": {
    html: path.join(
      process.cwd(),
      "src",
      "lib",
      "email",
      "templates",
      "educational-resources.ejs",
    ),
    text: path.join(
      process.cwd(),
      "src",
      "lib",
      "email",
      "templates",
      "educational-resources.txt.ejs",
    ),
  },
};

export async function renderEmailTemplate(
  templateName: EmailTemplateName,
  data: EmailTemplateData,
): Promise<RenderedEmail> {
  const files =
    TEMPLATE_FILES[templateName];

  if (!files) {
    throw new Error(
      `Unknown email template: ${templateName}`,
    );
  }

  const [
    htmlTemplate,
    textTemplate,
  ] = await Promise.all([
    fs.readFile(
      files.html,
      "utf8",
    ),
    fs.readFile(
      files.text,
      "utf8",
    ),
  ]);

  const templateData = {
    ...data,

    fromName: cleanString(
      data.fromName,
      DEFAULTS.fromName,
    ),

    fromEmail: cleanString(
      data.fromEmail,
      DEFAULTS.fromEmail,
    ),

    recipientName: cleanString(
      data.recipientName,
      DEFAULTS.recipientName,
    ),

    schoolName: cleanString(
      data.schoolName,
      DEFAULTS.schoolName,
    ),

    subject: cleanString(
      data.subject,
    ),

    previewText: cleanString(
      data.previewText,
      DEFAULTS.previewText,
    ),

    title: cleanString(
      data.title,
    ),

    intro: cleanString(
      data.intro,
    ),

    body: cleanString(
      data.body,
    ),

    buttonText: cleanString(
      data.buttonText,
      DEFAULTS.buttonText,
    ),

    buttonUrl: cleanString(
      data.buttonUrl,
      DEFAULTS.buttonUrl,
    ),

    products: Array.isArray(
      data.products,
    )
      ? data.products
      : [],

    catalogueUrl: cleanString(
      data.catalogueUrl,
      DEFAULTS.catalogueUrl,
    ),

    catalogueDownloadUrl:
      cleanString(
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

    unsubscribeUrl:
      cleanString(
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
    html: normalizeHtml(html),
    text: normalizeText(text),
  };
}

function cleanString(
  value: unknown,
  fallback = "",
): string {
  return typeof value ===
    "string"
    ? value.trim() || fallback
    : fallback;
}

function normalizeHtml(
  value: string,
): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeText(
  value: string,
): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(
      /[ \t]+\n/g,
      "\n",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}