"use client";

import { useState } from "react";

type ImportResponse = {
  error?: unknown;
  schools?: unknown;
};

type ExportResponse = {
  error?: unknown;
};

async function readImportResponse(response: Response): Promise<{ error?: string; schools: SchoolRecord[] }> {
  let payload: ImportResponse;

  try {
    payload = (await response.json()) as ImportResponse;
  } catch {
    throw new Error("The directory API returned an invalid response.");
  }

  if (!Array.isArray(payload.schools)) {
    return {
      error: typeof payload.error === "string" ? payload.error : undefined,
      schools: [],
    };
  }

  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
    schools: payload.schools as SchoolRecord[],
  };
}

async function readWebsiteScrapeResponse(response: Response): Promise<{ error?: string; status?: string; emails: WebsiteEmail[] }> {
  let payload: WebsiteScrapeResponse;

  try {
    payload = (await response.json()) as WebsiteScrapeResponse;
  } catch {
    throw new Error("The email scraper returned an invalid response.");
  }

  const emails = Array.isArray(payload.emails)
    ? payload.emails.filter((email): email is WebsiteEmail => (
      typeof email === "object" &&
      email !== null &&
      typeof (email as WebsiteEmail).email === "string" &&
      typeof (email as WebsiteEmail).sourcePage === "string"
    ))
    : [];

  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
    status: typeof payload.status === "string" ? payload.status : undefined,
    emails,
  };
}

import type { SchoolBoard, SchoolRecord } from "@/lib/directories/types";

type Board = SchoolBoard;

type EmailResult = {
  board: Board;
  schoolName: string;
  affiliationNumber?: string;
  schoolCode?: string;
  state?: string;
  district?: string;
  city?: string;
  website: string;
  email: string;
  sourcePage: string;
  status: "Success" | "No email" | "Failed";
  error?: string;
};

type WebsiteEmail = {
  email: string;
  sourcePage: string;
};

type WebsiteScrapeResponse = {
  emails?: unknown;
  error?: unknown;
  status?: unknown;
};

const SCHOOL_BATCH_SIZE = 20;

export default function Home() {
  const board: Board = "CBSE";
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [batchNumber, setBatchNumber] = useState(1);
  const [schoolTablePage, setSchoolTablePage] = useState(1);
  const [hasMoreSchoolBatches, setHasMoreSchoolBatches] = useState(true);
  const [emailResults, setEmailResults] = useState<EmailResult[]>([]);
  const [processedSchoolIds, setProcessedSchoolIds] = useState<string[]>([]);
  const [emailTablePage, setEmailTablePage] = useState(1);
  const [successOnly, setSuccessOnly] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState({ completed: 0, total: 0 });
  const [hasFetched, setHasFetched] = useState(false);
  const [fetchMessage, setFetchMessage] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [scrapeMessage, setScrapeMessage] = useState("");
  const [scrapeError, setScrapeError] = useState("");
  const [exportError, setExportError] = useState("");

  const isBusy = isFetching || isScraping || isExporting;
  const foundEmailCount = emailResults.filter((result) => result.status === "Success").length;
  const schoolPageCount = Math.max(1, Math.ceil(schools.length / SCHOOL_BATCH_SIZE));
  const visibleSchools = schools.slice(
    (schoolTablePage - 1) * SCHOOL_BATCH_SIZE,
    schoolTablePage * SCHOOL_BATCH_SIZE,
  );
  const visibleEmailResults = (successOnly
    ? emailResults.filter((result) => result.status === "Success")
    : emailResults
  ).slice((emailTablePage - 1) * SCHOOL_BATCH_SIZE, emailTablePage * SCHOOL_BATCH_SIZE);
  const emailPageCount = Math.max(1, Math.ceil(
    (successOnly ? emailResults.filter((result) => result.status === "Success") : emailResults).length / SCHOOL_BATCH_SIZE,
  ));

  async function handleFetchSchools(loadNextBatch = false) {
    const requestedLimit = SCHOOL_BATCH_SIZE;

    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
      setFetchError("The school batch size is invalid.");
      setFetchMessage("");
      return;
    }

    setIsFetching(true);
    setHasFetched(loadNextBatch ? hasFetched : false);
    setFetchMessage("");
    setFetchError("");
    if (!loadNextBatch) {
      setSchools([]);
      setSchoolTablePage(1);
      setHasMoreSchoolBatches(true);
    }
    setEmailResults([]);
    if (!loadNextBatch) {
      setProcessedSchoolIds([]);
      setBatchNumber(1);
    } else {
      setBatchNumber((currentBatch) => currentBatch + 1);
    }
    setEmailTablePage(1);
    setScrapeProgress({ completed: 0, total: 0 });
    setScrapeMessage("");
    setScrapeError("");
    setExportError("");

    try {
      const response = await fetch("/api/directories/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board,
          limit: requestedLimit,
          randomize: true,
          excludeSchoolCodes: loadNextBatch
            ? schools.map((school) => school.schoolCode ?? school.schoolName)
            : [],
        }),
      });
      const payload = await readImportResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "The directory request failed.");
      }

      setSchools((currentSchools) => loadNextBatch ? [...currentSchools, ...payload.schools] : payload.schools);
      setHasMoreSchoolBatches(payload.schools.length === SCHOOL_BATCH_SIZE);
      setHasFetched(true);
      setFetchMessage(
        payload.schools.length > 0
          ? `Batch ${loadNextBatch ? batchNumber + 1 : 1}: ${payload.schools.length} ${board} schools loaded.`
          : `No ${board} schools were returned.`,
      );
      if (loadNextBatch) {
        setSchoolTablePage(Math.floor((schools.length + payload.schools.length - 1) / SCHOOL_BATCH_SIZE) + 1);
      }
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : "The directory request failed.");
    } finally {
      setIsFetching(false);
    }
  }

  async function handleStartScraping() {
    const processedIds = new Set(processedSchoolIds);
    const schoolsToProcess = schools.filter((school) => !processedIds.has(getSchoolId(school)));

    if (schoolsToProcess.length === 0) {
      setScrapeError(
        schools.length === 0
          ? "Fetch a school batch before starting email scraping."
          : "All loaded schools have already been processed.",
      );
      setScrapeMessage("");
      return;
    }

    setIsScraping(true);
    setScrapeProgress({ completed: 0, total: schoolsToProcess.length });
    setScrapeMessage("");
    setScrapeError("");
    setEmailTablePage(1);

    const nextResults: EmailResult[] = [...emailResults];
    const seenSchoolEmails = new Set(
      emailResults
        .filter((result) => result.email !== "-")
        .map((result) => `${result.schoolCode ?? result.schoolName}:${result.email}`),
    );

    for (const [index, school] of schoolsToProcess.entries()) {
      if (!school.website) {
        nextResults.push({
          board: school.board,
          schoolName: school.schoolName,
          affiliationNumber: school.affiliationNumber,
          schoolCode: school.schoolCode,
          state: school.state,
          district: school.district,
          city: school.city,
          website: "-",
          email: "-",
          sourcePage: "-",
          status: "No email",
          error: "No website available.",
        });
        setEmailResults([...nextResults]);
        setProcessedSchoolIds((currentIds) => [...currentIds, getSchoolId(school)]);
        setScrapeProgress({ completed: index + 1, total: schoolsToProcess.length });
        continue;
      }

      try {
        const response = await fetch("/api/scraper/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: school.website }),
        });
        const payload = await readWebsiteScrapeResponse(response);

        if (!response.ok) {
          throw new Error(payload.error ?? "Website scraping failed.");
        }

        const websiteEmails = payload.emails;
        let addedEmail = false;

        for (const websiteEmail of websiteEmails) {
          const emailKey = `${school.schoolCode ?? school.schoolName}:${websiteEmail.email}`;

          if (seenSchoolEmails.has(emailKey)) {
            continue;
          }

          seenSchoolEmails.add(emailKey);
          addedEmail = true;
          nextResults.push({
            board: school.board,
            schoolName: school.schoolName,
            affiliationNumber: school.affiliationNumber,
            schoolCode: school.schoolCode,
            state: school.state,
            district: school.district,
            city: school.city,
            website: school.website ?? "",
            email: websiteEmail.email,
            sourcePage: websiteEmail.sourcePage,
            status: payload.status === "failed" ? "Failed" : "Success",
            error: payload.error,
          });
        }

        if (!addedEmail) {
          nextResults.push({
            board: school.board,
            schoolName: school.schoolName,
            affiliationNumber: school.affiliationNumber,
            schoolCode: school.schoolCode,
            state: school.state,
            district: school.district,
            city: school.city,
            website: school.website ?? "",
            email: "-",
            sourcePage: "-",
            status: payload.status === "failed" ? "Failed" : "No email",
            error: payload.error,
          });
        }
      } catch (error) {
        nextResults.push({
          board: school.board,
          schoolName: school.schoolName,
          affiliationNumber: school.affiliationNumber,
          schoolCode: school.schoolCode,
          state: school.state,
          district: school.district,
          city: school.city,
          website: school.website ?? "",
          email: "-",
          sourcePage: "-",
          status: "Failed",
          error: error instanceof Error ? error.message : "Website scraping failed.",
        });
        console.warn(
          `[dashboard] Email scraping failed for ${school.schoolName}`,
          error,
        );
      }

      setEmailResults([...nextResults]);
      setProcessedSchoolIds((currentIds) => [...currentIds, getSchoolId(school)]);
      setScrapeProgress({ completed: index + 1, total: schoolsToProcess.length });
    }

    const foundEmails = nextResults.filter((result) => result.status === "Success").length;
    setScrapeMessage(
      `${schoolsToProcess.length} school${schoolsToProcess.length === 1 ? "" : "s"} processed. ${foundEmails} email${foundEmails === 1 ? "" : "s"} found.`,
    );
    setIsScraping(false);
  }

  async function handleDownloadExcel() {
    if (emailResults.length === 0) {
      setExportError("Scrape school websites before downloading Excel.");
      return;
    }

    setIsExporting(true);
    setExportError("");

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: successOnly
            ? emailResults.filter((result) => result.status === "Success")
            : emailResults,
        }),
      });

      if (!response.ok) {
        let message = "Excel export failed.";

        try {
          const payload = (await response.json()) as ExportResponse;

          if (typeof payload.error === "string") {
            message = payload.error;
          }
        } catch {
          // Keep the fallback message when the error response is not JSON.
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "school-emails.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Excel export failed.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <main className="mx-auto flex h-[calc(100vh-65px)] mt-5 w-full max-w-7xl flex-col gap-3 overflow-hidden px-5 py-3 lg:px-8">
        <section className="grid shrink-0 gap-3 lg:grid-cols-[1.35fr_0.8fr]">
          <div className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-[0_6px_20px_rgba(21,44,67,0.04)]">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">01 / Directory</p>
                <h2 className="mt-1 text-base font-semibold text-[var(--navy)]">Fetch schools <span className="text-xs font-medium text-[var(--muted)]">/ batch {batchNumber}</span></h2>
              </div>
              <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${isFetching ? "bg-[#fff0df] text-[var(--orange)]" : "bg-[var(--pale-blue)] text-[var(--blue)]"}`}>
                {isFetching ? "Fetching" : "Ready"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-[var(--navy)]">Board</legend>
                <div className="flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-3 text-xs font-semibold text-[var(--navy)]">
                  {board} directory
                </div>
              </fieldset>

              <label className="text-xs font-medium text-[var(--navy)]">
                Schools per batch
                <div
                  className="mt-1 h-9 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-xs font-semibold outline-none transition focus:border-[var(--blue)] focus:ring-4 focus:ring-blue-100"
                >20</div>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => handleFetchSchools()} disabled={isBusy} className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--navy)] px-4 text-xs font-semibold text-white transition hover:bg-[var(--blue)] disabled:cursor-wait disabled:opacity-70">
                {isFetching ? "Fetching Schools..." : "Fetch Schools"}
                {!isFetching && <span aria-hidden="true" className="ml-2 text-base">-&gt;</span>}
              </button>
              <button type="button" onClick={() => handleFetchSchools(true)} disabled={isBusy || !hasFetched || !hasMoreSchoolBatches} className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--navy)] px-4 text-xs font-semibold text-[var(--navy)] transition hover:bg-[var(--canvas)] disabled:cursor-not-allowed disabled:opacity-60">
                Fetch Next 20
              </button>
              {fetchMessage && <p className="text-xs font-medium text-[var(--green)]">{fetchMessage}</p>}
              {fetchError && <p role="alert" className="text-xs font-medium text-[#b5483f]">{fetchError}</p>}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--navy)] p-4 text-white shadow-[0_6px_20px_rgba(21,44,67,0.06)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9fb5c7]">Pipeline status</p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold">{schools.length}</p>
                <p className="mt-1 text-xs text-[#b3c4d1]">schools in workspace</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold">{foundEmailCount}</p>
                <p className="mt-1 text-xs text-[#b3c4d1]">emails found</p>
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#314b62]">
              <div className="h-full w-1/4 rounded-full bg-[var(--orange)]" />
            </div>
            <p className="mt-2 text-[11px] text-[#b3c4d1]">{isFetching ? "Request in progress..." : isScraping ? `Scraping ${scrapeProgress.completed} of ${scrapeProgress.total} websites...` : hasFetched ? "Latest directory request complete." : "No directory data has been collected yet."}</p>
          </div>
        </section>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_6px_20px_rgba(21,44,67,0.04)]">
          <div className="flex flex-col gap-2 border-b border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Directory results</p>
              <h2 className="mt-0.5 text-base font-semibold text-[var(--navy)]">Schools <span className="text-xs font-medium text-[var(--muted)]">/ batch {batchNumber}</span></h2>
            </div>
            <span className="text-xs font-medium text-[var(--muted)]">{schools.length} records</span>
          </div>
          <TableShell headers={["Board", "School Name", "State", "District", "City"]}>
            {schools.length > 0 ? visibleSchools.map((school) => (
              <tr key={`${school.board}-${school.schoolCode ?? school.schoolName}`}>
                <td className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-[var(--blue)]">{school.board}</td>
                <td className="max-w-[220px] px-3 py-2 font-medium text-[var(--navy)]"><span className="block truncate" title={school.schoolName}>{school.schoolName}</span></td>
                <td className="px-3 py-2 text-[var(--muted)]">{school.state ?? "-"}</td>
                <td className="px-3 py-2 text-[var(--muted)]">{school.district ?? "-"}</td>
                <td className="px-3 py-2 text-[var(--muted)]">{school.city ?? "-"}</td>
              </tr>
            )) : (
              <EmptyRow columns={5} message={isFetching ? "Loading schools..." : hasFetched ? "No schools found for this request." : "Fetched schools will appear here."} />
            )}
          </TableShell>
          {schools.length > 0 && (
            <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-2.5 text-[11px] text-[var(--muted)]">
              <span>Showing {(schoolTablePage - 1) * SCHOOL_BATCH_SIZE + 1}-{Math.min(schoolTablePage * SCHOOL_BATCH_SIZE, schools.length)} of {schools.length}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSchoolTablePage((page) => Math.max(1, page - 1))} disabled={schoolTablePage === 1 || isBusy} className="rounded-lg border border-[var(--line)] px-3 py-1.5 font-semibold text-[var(--navy)] disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                <span>Page {schoolTablePage} of {schoolPageCount}</span>
                <button type="button" onClick={() => setSchoolTablePage((page) => Math.min(schoolPageCount, page + 1))} disabled={schoolTablePage === schoolPageCount || isBusy} className="rounded-lg border border-[var(--line)] px-3 py-1.5 font-semibold text-[var(--navy)] disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_6px_20px_rgba(21,44,67,0.04)]">
          <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--orange)]">02 / Extraction</p>
              <h2 className="mt-0.5 text-base font-semibold text-[var(--navy)]">Email Scraping <span className="text-xs font-medium text-[var(--muted)]">/ active batch</span></h2>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
                <input type="checkbox" checked={successOnly} onChange={(event) => { setSuccessOnly(event.target.checked); setEmailTablePage(1); }} disabled={isBusy} className="size-4 accent-[var(--navy)]" />
                Success only
              </label>
              <button type="button" onClick={handleStartScraping} disabled={isBusy} className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--navy)] px-4 text-xs font-semibold text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white disabled:cursor-wait disabled:opacity-60">
                {isScraping ? `Scraping ${scrapeProgress.completed}/${scrapeProgress.total}` : "Start Email Scraping"}
                {!isScraping && <span aria-hidden="true" className="ml-2 text-base">-&gt;</span>}
              </button>
              {scrapeMessage && <p className="w-full text-xs font-medium text-[var(--orange)] sm:w-auto">{scrapeMessage}</p>}
              {scrapeError && <p role="alert" className="w-full text-xs font-medium text-[#b5483f] sm:w-auto">{scrapeError}</p>}
            </div>
          </div>
          {isScraping && (
            <div className="border-b border-[var(--line)] px-6 py-3">
              <div className="mb-2 flex justify-between text-xs font-medium text-[var(--muted)]">
                <span>Processing websites</span>
                <span>{scrapeProgress.completed}/{scrapeProgress.total}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--canvas)]">
                <div
                  className="h-full rounded-full bg-[var(--orange)] transition-all"
                  style={{ width: `${scrapeProgress.total > 0 ? (scrapeProgress.completed / scrapeProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          <TableShell headers={["Board", "School Name", "Website", "Email", "Source", "Status"]}>
            {emailResults.length > 0 ? visibleEmailResults.map((result, index) => (
              <tr key={`${result.board}-${result.schoolName}-${result.email}-${index}`}>
                <td className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-[var(--blue)]">{result.board}</td>
                <td className="max-w-[180px] px-3 py-2 font-medium text-[var(--navy)]"><span className="block truncate" title={result.schoolName}>{result.schoolName}</span></td>
                <td className="max-w-[170px] px-3 py-2">
                  {result.website === "-" ? <span className="text-[var(--muted)]">-</span> : <a href={result.website} target="_blank" rel="noreferrer" className="block truncate text-[var(--blue)] hover:underline" title={result.website}>{result.website}</a>}
                </td>
                <td className="max-w-[170px] px-3 py-2">
                  {result.email === "-" ? <span className="text-[var(--muted)]">-</span> : <a href={`mailto:${result.email}`} className="font-medium text-[var(--blue)] hover:underline">{result.email}</a>}
                </td>
                <td className="max-w-[170px] px-3 py-2">
                  {result.sourcePage === "-" ? <span className="text-[var(--muted)]">-</span> : <a href={result.sourcePage} target="_blank" rel="noreferrer" className="block truncate text-[var(--blue)] hover:underline" title={result.sourcePage}>{result.sourcePage}</a>}
                </td>
                <td className="px-3 py-2">
                  <span title={result.error} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${result.status === "Success" ? "bg-[var(--mint)] text-[var(--green)]" : result.status === "Failed" ? "bg-[#fde9e6] text-[#b5483f]" : "bg-[var(--canvas)] text-[var(--muted)]"}`}>
                    {result.status}
                  </span>
                </td>
              </tr>
            )) : (
              <EmptyRow columns={6} message={isScraping ? "Email results will appear as websites finish." : successOnly ? "No successful email results yet." : "Extracted email addresses will appear here."} />
            )}
          </TableShell>
          {emailResults.length > 0 && (
            <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-2.5 text-[11px] text-[var(--muted)]">
              <span>{successOnly ? foundEmailCount : emailResults.length} result{(successOnly ? foundEmailCount : emailResults.length) === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setEmailTablePage((page) => Math.max(1, page - 1))} disabled={emailTablePage === 1 || isBusy} className="rounded-lg border border-[var(--line)] px-3 py-1.5 font-semibold text-[var(--navy)] disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                <span>Page {emailTablePage} of {emailPageCount}</span>
                <button type="button" onClick={() => setEmailTablePage((page) => Math.min(emailPageCount, page + 1))} disabled={emailTablePage === emailPageCount || isBusy} className="rounded-lg border border-[var(--line)] px-3 py-1.5 font-semibold text-[var(--navy)] disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </section>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <button type="button" onClick={handleDownloadExcel} disabled={isBusy || (successOnly ? foundEmailCount === 0 : emailResults.length === 0)} className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-[#dbe2e8] disabled:text-[#8997a2] enabled:bg-[var(--navy)] enabled:text-white enabled:hover:bg-[var(--blue)]">
            {isExporting ? "Preparing Excel..." : successOnly ? "Download Successful" : "Download Excel"}
            {!isExporting && <span aria-hidden="true" className="ml-2 text-base">&#8595;</span>}
          </button>
          {exportError && <p role="alert" className="text-xs font-medium text-[#b5483f]">{exportError}</p>}
        </div>
      </main>
    </div>
  );
}

function TableShell({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--canvas)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
          <tr>
            {headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2.5 font-semibold">{header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)] [&>tr]:transition-colors [&>tr:hover]:bg-[var(--canvas)]">{children}</tbody>
      </table>
    </div>
  );
}

function EmptyRow({ columns, message }: { columns: number; message: string }) {
  return (
    <tr>
      <td colSpan={columns} className="px-6 py-12 text-center text-sm text-[var(--muted)]">{message}</td>
    </tr>
  );
}

function getSchoolId(school: SchoolRecord): string {
  return school.schoolCode ?? school.schoolName;
}
