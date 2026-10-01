import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { extractEmailsFromHtml } from "./emailExtractor";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const MAX_RELEVANT_PAGES = 5;
const USER_AGENT =
  "SchoolEmailScraper/0.1 (public institutional pages only)";
const RELEVANT_KEYWORDS = [
  "contact",
  "contact-us",
  "about",
  "about-us",
  "admissions",
  "admission",
  "reach-us",
  "reach us",
];

export type WebsiteScrapeStatus = "success" | "no_email" | "partial" | "failed";

export type WebsiteEmail = {
  email: string;
  sourcePage: string;
};

export type WebsiteScrapeResult = {
  url: string;
  emails: WebsiteEmail[];
  sourcePages: string[];
  status: WebsiteScrapeStatus;
  error?: string;
};

type FetchedPage = {
  url: string;
  html: string;
};

type PageFetchResult =
  | { page: FetchedPage }
  | { error: string };

type InternalLink = {
  url: string;
  score: number;
};

export async function scrapeWebsite(url: string): Promise<WebsiteScrapeResult> {
  const inputUrl = typeof url === "string" ? url.trim() : "";
  const normalizedUrl = normalizeUrl(inputUrl);

  if (!normalizedUrl) {
    return failedResult(inputUrl, "Invalid website URL.");
  }

  const homepageResult = await fetchPage(normalizedUrl, new URL(normalizedUrl).hostname);

  if ("error" in homepageResult) {
    return failedResult(normalizedUrl, homepageResult.error);
  }

  const emails = new Map<string, WebsiteEmail>();
  const sourcePages = new Set<string>();
  const visitedPages = new Set<string>([homepageResult.page.url]);
  let failedPageCount = 0;

  try {
    collectPageEmails(homepageResult.page, emails);
    sourcePages.add(homepageResult.page.url);

    const relevantLinks = findRelevantInternalLinks(
      homepageResult.page.html,
      homepageResult.page.url,
    );

    for (const link of relevantLinks.slice(0, MAX_RELEVANT_PAGES)) {
      if (visitedPages.has(link.url)) {
        continue;
      }

      visitedPages.add(link.url);
      const pageResult = await fetchPage(link.url, new URL(normalizedUrl).hostname);

      if ("error" in pageResult) {
        failedPageCount += 1;
        console.warn(`[website-scraper] Could not fetch ${link.url}: ${pageResult.error}`);
        continue;
      }

      try {
        collectPageEmails(pageResult.page, emails);
        sourcePages.add(pageResult.page.url);
      } catch {
        failedPageCount += 1;
        console.warn(`[website-scraper] Could not parse ${pageResult.page.url}.`);
      }
    }
  } catch {
    return failedResult(normalizedUrl, "Website returned invalid HTML.");
  }

  const emailResults = [...emails.values()];
  const hasEmails = emails.size > 0;
  const status: WebsiteScrapeStatus = failedPageCount > 0
    ? "partial"
    : hasEmails
      ? "success"
      : "no_email";

  return {
    url: normalizedUrl,
    emails: emailResults,
    sourcePages: [...sourcePages],
    status,
    ...(failedPageCount > 0
      ? { error: `${failedPageCount} relevant page(s) could not be fetched.` }
      : {}),
  };
}

function collectPageEmails(
  page: FetchedPage,
  emails: Map<string, WebsiteEmail>,
): void {
  const $ = cheerio.load(page.html);
  const extractedEmails = extractEmailsFromHtml($.html());

  for (const email of extractedEmails) {
    if (!emails.has(email)) {
      emails.set(email, {
        email,
        sourcePage: page.url,
      });
    }
  }
}

function findRelevantInternalLinks(
  html: string,
  homepageUrl: string,
): InternalLink[] {
  const $ = cheerio.load(html);
  const homepage = new URL(homepageUrl);
  const links = new Map<string, InternalLink>();

  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href")?.trim();
    const visibleText = $(anchor).text().trim();

    if (!href || !containsRelevantKeyword(href, visibleText)) {
      return;
    }

    const pageUrl = resolveInternalUrl(href, homepage);

    if (!pageUrl || pageUrl === homepage.href) {
      return;
    }

    const score = keywordScore(href, visibleText);
    const existingLink = links.get(pageUrl);

    if (!existingLink || score > existingLink.score) {
      links.set(pageUrl, { url: pageUrl, score });
    }
  });

  return [...links.values()].sort((left, right) => right.score - left.score);
}

function containsRelevantKeyword(href: string, visibleText: string): boolean {
  const value = `${href} ${visibleText}`.toLowerCase();
  return RELEVANT_KEYWORDS.some((keyword) => value.includes(keyword));
}

function keywordScore(href: string, visibleText: string): number {
  const hrefValue = href.toLowerCase();
  const textValue = visibleText.toLowerCase();
  let score = 0;

  for (const keyword of RELEVANT_KEYWORDS) {
    if (hrefValue.includes(keyword)) {
      score += 2;
    }

    if (textValue.includes(keyword)) {
      score += 1;
    }
  }

  return score;
}

function resolveInternalUrl(
  href: string,
  homepage: URL,
): string | undefined {
  if (/^(?:mailto:|tel:|javascript:|data:)/i.test(href)) {
    return undefined;
  }

  try {
    const pageUrl = new URL(href, homepage);

    if (
      !["http:", "https:"].includes(pageUrl.protocol) ||
      pageUrl.hostname !== homepage.hostname
    ) {
      return undefined;
    }

    pageUrl.hash = "";
    return pageUrl.toString();
  } catch {
    return undefined;
  }
}

async function fetchPage(url: string, allowedHostname: string): Promise<PageFetchResult> {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const safeUrl = await validatePublicUrl(currentUrl);

    if (!safeUrl) {
      return { error: "Website URL resolves to a private or reserved network address." };
    }

    if (new URL(safeUrl).hostname !== allowedHostname) {
      return { error: "Redirect destination hostname is not allowed." };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(safeUrl, {
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": USER_AGENT,
        },
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get("location");

        if (!location || redirectCount === MAX_REDIRECTS) {
          return { error: "Website redirect chain is invalid or too long." };
        }

        const destination = new URL(location, safeUrl);

        if (destination.hostname !== allowedHostname) {
          return { error: "Redirect destination hostname is not allowed." };
        }

        currentUrl = destination.toString();
        continue;
      }

      if (!response.ok) {
        return { error: `Website returned HTTP ${response.status}.` };
      }

      const contentType = response.headers.get("content-type")?.toLowerCase();

      if (
        contentType &&
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml")
      ) {
        return { error: "Website response was not HTML." };
      }

      const html = await response.text();

      if (!html.trim()) {
        return { error: "Website returned an empty response." };
      }

      return { page: { url: safeUrl, html } };
    } catch (error) {
      if (isAbortError(error)) {
        return { error: `Website request timed out after ${REQUEST_TIMEOUT_MS}ms.` };
      }

      if (error instanceof TypeError) {
        return { error: "Website network request failed." };
      }

      return { error: error instanceof Error ? error.message : "Website request failed." };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { error: "Website redirect chain is too long." };
}

function normalizeUrl(value: string): string | undefined {
  if (!value || (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value))) {
    return undefined;
  }

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(candidate);

    if (!isAllowedProtocol(parsed) || parsed.username || parsed.password) {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

export async function validatePublicUrl(value: string): Promise<string | undefined> {
  const normalizedUrl = normalizeUrl(value);

  if (!normalizedUrl) {
    return undefined;
  }

  const hostname = new URL(normalizedUrl).hostname;

  if (isUnsafeHostname(hostname)) {
    return undefined;
  }

  try {
    const addresses = isIP(hostname)
      ? [hostname]
      : (await lookup(hostname, { all: true })).map((address) => address.address);

    return addresses.length > 0 && addresses.every((address) => !isUnsafeAddress(address))
      ? normalizedUrl
      : undefined;
  } catch {
    return undefined;
  }
}

function isAllowedProtocol(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

function isUnsafeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "local";
}

function isUnsafeAddress(address: string): boolean {
  const normalized = address.toLowerCase();

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("::ffff:")
  ) {
    const mappedIpv4 = normalized.startsWith("::ffff:")
      ? normalized.slice("::ffff:".length)
      : "";

    if (mappedIpv4 && isIP(mappedIpv4) === 4) {
      return isUnsafeAddress(mappedIpv4);
    }

    return true;
  }

  if (isIP(normalized) === 4) {
    const [first, second, third] = normalized.split(".").map(Number);
    return first === 10 || first === 127 || first === 0 || first >= 224 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254) ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 198 && second === 18) ||
      (first === 198 && second === 19) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113);
  }

  const firstSegment = Number.parseInt(normalized.split(":")[0] || "0", 16);
  const secondSegment = Number.parseInt(normalized.split(":")[1] || "0", 16);

  return (
    (firstSegment >= 0xfc00 && firstSegment <= 0xfdff) ||
    (firstSegment >= 0xfe80 && firstSegment <= 0xfebf) ||
    firstSegment >= 0xff00 ||
    (firstSegment === 0x2001 && secondSegment === 0x0db8) ||
    (firstSegment === 0x2001 && secondSegment === 0x0002)
  );
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function failedResult(url: string, error: string): WebsiteScrapeResult {
  return {
    url,
    emails: [],
    sourcePages: [],
    status: "failed",
    error,
  };
}
