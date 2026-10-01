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
  unsubscribeUrl?: string;
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
    fromName: data.fromName ?? "",
    fromEmail: data.fromEmail ?? "",
    recipientName: data.recipientName ?? "",
    schoolName: data.schoolName ?? "",
    previewText: data.previewText ?? "",
    buttonText: data.buttonText ?? "",
    buttonUrl: data.buttonUrl ?? "",
    unsubscribeUrl: data.unsubscribeUrl ?? "",
    products: data.products ?? [],
    catalogueUrl: data.catalogueUrl ?? "/catalog",
  };

  return {
    html: ejs.render(htmlTemplate, templateData, { rmWhitespace: true }),
    text: ejs.render(textTemplate, templateData, { rmWhitespace: true }),
  };
}

async function readTemplateFile(filename: string): Promise<string> {
  const directPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "templates",
    filename,
  );
  try {
    return await fs.readFile(directPath, "utf8");
  } catch {
    const cwdPath = path.join(process.cwd(), "src", "lib", "email", "templates", filename);
    return await fs.readFile(cwdPath, "utf8");
  }
}
