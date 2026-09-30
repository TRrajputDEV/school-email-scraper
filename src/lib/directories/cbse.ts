import * as cheerio from "cheerio";

import type { DirectoryScrapeOptions, SchoolRecord } from "./types";

const CBSE_DIRECTORY_URL =
  "https://saras.cbse.gov.in/SARAS/AffiliatedList/ListOfSchdirReport";
const REQUEST_TIMEOUT_MS = 20_000;

type StateOption = {
  value: string;
  label: string;
};

export async function scrapeCBSESchools(
  limit?: number,
  options: DirectoryScrapeOptions = {},
): Promise<SchoolRecord[]> {
  const target = getTargetLimit(limit);

  if (target === 0) {
    return [];
  }

  const initialHtml = await fetchHtml(CBSE_DIRECTORY_URL);
  const $ = cheerio.load(initialHtml);
  const token = $("input[name='__RequestVerificationToken']")
    .first()
    .attr("value");
  const states = $("#State option[value]")
    .map((_, option) => ({
      value: $(option).attr("value")?.trim() ?? "",
      label: normalizeText($(option).text()),
    }))
    .get()
    .filter((state) => state.value && state.label);

  if (!token) {
    throw new Error("CBSE directory form token was not found.");
  }

  if (states.length === 0) {
    throw new Error("CBSE directory state options were not found.");
  }

  const records: SchoolRecord[] = [];

  const stateOrder = options.randomize ? shuffle(states) : states;
  const excludedCodes = new Set(options.excludeSchoolCodes ?? []);

  for (const state of stateOrder) {
    if (records.length >= target) {
      break;
    }

    try {
      const html = await fetchStateResults(state, token);
      const stateRecords = parseSchoolRows(html, state.label)
        .filter((record) => !excludedCodes.has(record.schoolCode ?? record.schoolName));
      records.push(...(options.randomize ? shuffle(stateRecords) : stateRecords).slice(0, target - records.length));
      console.info(
        `[CBSE] ${state.label}: parsed ${stateRecords.length} schools`,
      );
    } catch (error) {
      console.warn(`[CBSE] ${state.label}: unable to parse state results`, error);
    }
  }

  return records.slice(0, target);
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function getTargetLimit(limit?: number): number {
  if (limit === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (!Number.isFinite(limit) || limit < 0) {
    throw new Error("CBSE school limit must be a finite, non-negative number.");
  }

  return Math.floor(limit);
}

async function fetchStateResults(
  state: StateOption,
  token: string,
): Promise<string> {
  const formData = new URLSearchParams({
    __RequestVerificationToken: token,
    MainRadioValue: "State_wise",
    State: state.value,
    District: "",
    Region: "",
    InstName_orAddress: "",
    RegiAffNo: "0",
    SchoolStatusWise: "0",
  });

  return fetchHtml(CBSE_DIRECTORY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
    },
    body: formData.toString(),
  });
}

async function fetchHtml(
  url: string,
  init: RequestInit = {},
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`CBSE request failed with HTTP ${response.status}.`);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`CBSE request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseSchoolRows(html: string, stateLabel: string): SchoolRecord[] {
  const $ = cheerio.load(html);
  const records: SchoolRecord[] = [];

  $("#myTable tbody tr").each((_, row) => {
    const cells = $(row).find("td");

    if (cells.length < 6) {
      console.warn(`[CBSE] ${stateLabel}: skipped a row with missing cells.`);
      return;
    }

    const identity = normalizeText(cells.eq(1).text());
    const location = normalizeText(cells.eq(2).text());
    const school = normalizeText(cells.eq(4).text());
    const contact = normalizeText(cells.eq(5).text());
    const schoolName = extractField(school, /Name\s*:\s*(.*?)(?=Head\/Principal Name\s*:|$)/i);

    if (!schoolName) {
      console.warn(`[CBSE] ${stateLabel}: school name could not be extracted.`);
      return;
    }

    const affiliationNumber = extractField(identity, /Aff\.\s*No\.\s*:\s*([0-9]+)/i);
    const schoolCode = extractField(identity, /Sch\.\s*Code\s*:\s*([0-9]+)/i);
    const state = extractField(location, /State\s*:\s*(.*?)(?=District\s*:|$)/i);
    const district = extractField(location, /District\s*:\s*(.*)$/i);
    const address = extractField(contact, /Address\s*:\s*(.*?)(?=Website\s*:|$)/i);
    const rawWebsite = extractField(contact, /Website\s*:\s*(.*)$/i);
    const website = normalizeWebsite(rawWebsite, stateLabel, schoolName);

    if (!affiliationNumber && !schoolCode) {
      console.warn(`[CBSE] ${stateLabel}: affiliation number and school code are missing for ${schoolName}.`);
    }

    records.push({
      board: "CBSE",
      schoolName,
      affiliationNumber,
      schoolCode,
      state,
      district,
      address,
      website,
    });
  });

  return records;
}

function extractField(value: string, pattern: RegExp): string | undefined {
  const match = value.match(pattern);
  const field = match?.[1] ? normalizeText(match[1]) : "";
  return field || undefined;
}

function normalizeWebsite(
  value: string | undefined,
  stateLabel: string,
  schoolName: string,
): string | undefined {
  if (!value) {
    console.warn(`[CBSE] ${stateLabel}: website is missing for ${schoolName}.`);
    return undefined;
  }

  const compactValue = value.replace(/\s+/g, "").replace(/[),.;]+$/, "");
  const candidate = /^https?:\/\//i.test(compactValue)
    ? compactValue
    : `https://${compactValue}`;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();

    if (
      !["http:", "https:"].includes(url.protocol) ||
      (!hostname.includes(".") && hostname !== "localhost")
    ) {
      throw new Error("invalid hostname");
    }

    return url.toString();
  } catch {
    console.warn(
      `[CBSE] ${stateLabel}: invalid website for ${schoolName}: ${value}`,
    );
    return undefined;
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
