import * as cheerio from "cheerio";

const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const HIDDEN_CONTENT_SELECTOR =
  "script, style, noscript, template, [hidden], [aria-hidden='true']";

/** Extracts publicly visible email addresses from caller-provided HTML. */
export function extractEmailsFromHtml(html: string): string[] {
  if (!html.trim()) {
    return [];
  }

  const $ = cheerio.load(html);
  $(HIDDEN_CONTENT_SELECTOR).remove();

  const emails = new Set<string>();
  collectEmails(getVisibleText($), emails);

  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href");

    if (!href) {
      return;
    }

    const normalizedHref = href.trim();

    if (/^mailto:/i.test(normalizedHref)) {
      collectEmails(decodeMailtoTarget(normalizedHref), emails);
    }

    collectEmails(normalizedHref.replace(/[/?#=&]/g, " "), emails);
  });

  return [...emails].sort();
}

function collectEmails(value: string, emails: Set<string>): void {
  for (const match of value.matchAll(EMAIL_PATTERN)) {
    const email = normalizeEmail(match[0]);

    if (email && isValidEmail(email)) {
      emails.add(email);
    }
  }
}

function getVisibleText($: cheerio.CheerioAPI): string {
  const textNodes = $("body").length > 0
    ? $("body").find("*").contents()
    : $.root().contents();

  return textNodes
    .filter((_, node) => node.type === "text")
    .map((_, node) => $(node).text())
    .get()
    .join(" ");
}

function decodeMailtoTarget(href: string): string {
  const target = href.replace(/^mailto:/i, "").split("?", 1)[0];

  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function normalizeEmail(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[<([{]+|[>\])},;:]+$/g, "");
}

function isValidEmail(email: string): boolean {
  if (email.length > 254) {
    return false;
  }

  const [localPart, domain] = email.split("@");

  if (!localPart || !domain || localPart.length > 64) {
    return false;
  }

  if (
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    /[/?=]/.test(localPart) ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.includes("..")
  ) {
    return false;
  }

  return domain.split(".").every((label) => label.length > 0 && !label.startsWith("-") && !label.endsWith("-"));
}
