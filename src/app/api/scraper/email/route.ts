import { NextResponse } from "next/server";

import { scrapeWebsite } from "@/lib/scraper/scrapeWebsite";

export const runtime = "nodejs";

type EmailScrapeRequest = {
  url?: unknown;
};

export async function POST(request: Request) {
  let body: EmailScrapeRequest;

  try {
    body = (await request.json()) as EmailScrapeRequest;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json(
      { error: "url must be a non-empty string." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await scrapeWebsite(body.url));
  } catch (error) {
    console.error("[scraper/email] Website scraper failed", error);

    return NextResponse.json(
      {
        url: body.url,
        emails: [],
        sourcePages: [],
        status: "failed",
        error: "Website scraping failed.",
      },
      { status: 502 },
    );
  }
}
