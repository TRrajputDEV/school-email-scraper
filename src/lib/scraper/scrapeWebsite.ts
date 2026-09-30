import * as cheerio from "cheerio";

import { extractEmailsFromHtml } from "./emailExtractor";

const REQUEST_TIMEOUT_MS = 15_000;
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

export type WebsiteScrapeStatus = "success" | "no_email" | "failed";

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

  const homepageResult = await fetchPage(normalizedUrl);

  if ("error" in homepageResult) {
    return failedResult(normalizedUrl, homepageResult.error);
  }

  const emails = new Map<string, WebsiteEmail>();
  const sourcePages = new Set<string>();
  const visitedPages = new Set<string>([homepageResult.page.url]);

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
      const pageResult = await fetchPage(link.url);

      if ("error" in pageResult) {
        console.warn(`[website-scraper] Could not fetch ${link.url}: ${pageResult.error}`);
        continue;
      }

      try {
        collectPageEmails(pageResult.page, emails);
        sourcePages.add(pageResult.page.url);
      } catch {
        console.warn(`[website-scraper] Could not parse ${pageResult.page.url}.`);
      }
    }
  } catch {
    return failedResult(normalizedUrl, "Website returned invalid HTML.");
  }

  const emailResults = [...emails.values()];
  const pageErrors = visitedPages.size - sourcePages.size;

  return {
    url: normalizedUrl,
    emails: emailResults,
    sourcePages: [...sourcePages],
    status: emailResults.length > 0 ? "success" : "no_email",
    ...(pageErrors > 0
      ? { error: `${pageErrors} relevant page(s) could not be fetched.` }
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

async function fetchPage(url: string): Promise<PageFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": USER_AGENT,
      },
    });

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

    return {
      page: {
        url: response.url || url,
        html,
      },
    };
  } catch (error) {
    if (isAbortError(error)) {
      return { error: `Website request timed out after ${REQUEST_TIMEOUT_MS}ms.` };
    }

    if (error instanceof TypeError) {
      return { error: "Website network request failed." };
    }

    return {
      error: error instanceof Error ? error.message : "Website request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrl(value: string): string | undefined {
  if (!value || (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value))) {
    return undefined;
  }

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(candidate);

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
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
