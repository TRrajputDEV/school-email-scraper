"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SchoolRecord } from "@/lib/directories/types";

type ImportResponse = {
  error?: unknown;
  schools?: unknown;
};

type FilterOption = {
  value: string;
  label: string;
};

type FilterResponse = {
  states?: unknown;
  districts?: unknown;
  error?: unknown;
};

type ExportResponse = {
  error?: unknown;
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

type EmailResult = {
  board: "CBSE";
  schoolName: string;
  affiliationNumber?: string;
  schoolCode?: string;
  state?: string;
  district?: string;
  city?: string;
  website: string;
  email: string;
  sourcePage: string;
  status: "Success" | "No email" | "Partial" | "Failed";
  error?: string;
};

type EmailFilter = "all" | "success" | "selected";

type WorkspaceSnapshot = {
  version: 2;
  schools: SchoolRecord[];
  emailResults: EmailResult[];
  selectedRecipientIds: string[];
  processedSchoolIds: string[];
  stateFilter: string;
  districtFilter: string;
  emailFilter: EmailFilter;
  batchNumber: number;
  schoolTablePage: number;
  emailTablePage: number;
  hasMoreSchoolBatches: boolean;
  hasFetched: boolean;
};

const STORAGE_KEY = "school-email-scraper:workspace:v2";
const SCHOOL_BATCH_SIZE = 20;

async function readImportResponse(
  response: Response,
): Promise<{
  error?: string;
  schools: SchoolRecord[];
}> {
  let payload: ImportResponse;

  try {
    payload = (await response.json()) as ImportResponse;
  } catch {
    throw new Error(
      "The directory API returned an invalid response.",
    );
  }

  if (!Array.isArray(payload.schools)) {
    return {
      error:
        typeof payload.error === "string"
          ? payload.error
          : undefined,
      schools: [],
    };
  }

  return {
    error:
      typeof payload.error === "string"
        ? payload.error
        : undefined,
    schools: payload.schools as SchoolRecord[],
  };
}

async function readWebsiteScrapeResponse(
  response: Response,
): Promise<{
  error?: string;
  status?: string;
  emails: WebsiteEmail[];
}> {
  let payload: WebsiteScrapeResponse;

  try {
    payload =
      (await response.json()) as WebsiteScrapeResponse;
  } catch {
    throw new Error(
      "The email scraper returned an invalid response.",
    );
  }

  const emails = Array.isArray(payload.emails)
    ? payload.emails.filter(
        (email): email is WebsiteEmail =>
          typeof email === "object" &&
          email !== null &&
          typeof (email as WebsiteEmail).email ===
            "string" &&
          typeof (email as WebsiteEmail).sourcePage ===
            "string",
      )
    : [];

  return {
    error:
      typeof payload.error === "string"
        ? payload.error
        : undefined,
    status:
      typeof payload.status === "string"
        ? payload.status
        : undefined,
    emails,
  };
}

export default function Home() {
  const [cbseUnlocked, setCbseUnlocked] = useState<
    boolean | null
  >(null);

  const [accessCode, setAccessCode] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [accessError, setAccessError] = useState("");

  const [stateFilter, setStateFilter] = useState("");
  const [districtFilter, setDistrictFilter] =
    useState("");

  const [stateOptions, setStateOptions] = useState<
    FilterOption[]
  >([]);
  const [districtOptions, setDistrictOptions] = useState<
    FilterOption[]
  >([]);

  const [filterLoading, setFilterLoading] =
    useState(false);
  const [filterError, setFilterError] = useState("");

  const [schools, setSchools] = useState<
    SchoolRecord[]
  >([]);

  const [batchNumber, setBatchNumber] = useState(1);
  const [schoolTablePage, setSchoolTablePage] =
    useState(1);

  const [hasMoreSchoolBatches, setHasMoreSchoolBatches] =
    useState(true);

  const [emailResults, setEmailResults] = useState<
    EmailResult[]
  >([]);

  const [selectedRecipientIds, setSelectedRecipientIds] =
    useState<string[]>([]);

  const [processedSchoolIds, setProcessedSchoolIds] =
    useState<string[]>([]);

  const [emailTablePage, setEmailTablePage] =
    useState(1);

  const [emailFilter, setEmailFilter] =
    useState<EmailFilter>("all");

  const [isFetching, setIsFetching] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [scrapeProgress, setScrapeProgress] =
    useState({
      completed: 0,
      total: 0,
    });

  const [hasFetched, setHasFetched] = useState(false);

  const [fetchMessage, setFetchMessage] =
    useState("");
  const [fetchError, setFetchError] =
    useState("");

  const [scrapeMessage, setScrapeMessage] =
    useState("");
  const [scrapeError, setScrapeError] =
    useState("");

  const [exportError, setExportError] =
    useState("");

const workspaceLoaded = useRef(false);
  const isBusy =
    isFetching || isScraping || isExporting;

  const foundEmailCount = emailResults.filter(
    (result) => result.status === "Success",
  ).length;

  const selectedRecipients = emailResults.filter(
    (result) =>
      selectedRecipientIds.includes(
        getRecipientId(result),
      ),
  );

  const selectedCount =
    selectedRecipients.length;

  const schoolPageCount = Math.max(
    1,
    Math.ceil(
      schools.length / SCHOOL_BATCH_SIZE,
    ),
  );

  const visibleSchools = schools.slice(
    (schoolTablePage - 1) *
      SCHOOL_BATCH_SIZE,
    schoolTablePage *
      SCHOOL_BATCH_SIZE,
  );

  const filteredEmailResults =
    emailFilter === "success"
      ? emailResults.filter(
          (result) =>
            result.status === "Success",
        )
      : emailFilter === "selected"
        ? emailResults.filter((result) =>
            selectedRecipientIds.includes(
              getRecipientId(result),
            ),
          )
        : emailResults;

  const visibleEmailResults =
    filteredEmailResults.slice(
      (emailTablePage - 1) *
        SCHOOL_BATCH_SIZE,
      emailTablePage *
        SCHOOL_BATCH_SIZE,
    );

  const emailPageCount = Math.max(
    1,
    Math.ceil(
      filteredEmailResults.length /
        SCHOOL_BATCH_SIZE,
    ),
  );

  const selectableFilteredResults =
    filteredEmailResults.filter(
      (result) =>
        result.status === "Success",
    );

  const allFilteredSelected =
    selectableFilteredResults.length > 0 &&
    selectableFilteredResults.every(
      (result) =>
        selectedRecipientIds.includes(
          getRecipientId(result),
        ),
    );

  /*
   * ------------------------------------------------------
   * CHECK CBSE SESSION
   * ------------------------------------------------------
   */

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      try {
        const response = await fetch(
          "/api/cbse/status",
          {
            cache: "no-store",
          },
        );

        const payload =
          (await response.json()) as {
            unlocked?: unknown;
          };

        if (!active) {
          return;
        }

        setCbseUnlocked(
          response.ok &&
            payload.unlocked === true,
        );
      } catch {
        if (active) {
          setCbseUnlocked(false);
        }
      }
    }

    void checkAccess();

    return () => {
      active = false;
    };
  }, []);

  /*
   * ------------------------------------------------------
   * LOAD SAVED WORKSPACE
   * ------------------------------------------------------
   */

useEffect(() => {
  try {
    const raw =
      window.localStorage.getItem(
        STORAGE_KEY,
      );

    if (!raw) {
      workspaceLoaded.current = true;
      return;
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (!isWorkspaceSnapshot(parsed)) {
      workspaceLoaded.current = true;
      return;
    }

    startTransition(() => {
      setSchools(parsed.schools);
      setEmailResults(
        parsed.emailResults,
      );
      setSelectedRecipientIds(
        parsed.selectedRecipientIds,
      );
      setProcessedSchoolIds(
        parsed.processedSchoolIds,
      );
      setStateFilter(
        parsed.stateFilter,
      );
      setDistrictFilter(
        parsed.districtFilter,
      );
      setEmailFilter(
        parsed.emailFilter,
      );
      setBatchNumber(
        parsed.batchNumber,
      );
      setSchoolTablePage(
        parsed.schoolTablePage,
      );
      setEmailTablePage(
        parsed.emailTablePage,
      );
      setHasMoreSchoolBatches(
        parsed.hasMoreSchoolBatches,
      );
      setHasFetched(
        parsed.hasFetched,
      );
    });
  } catch {
    window.localStorage.removeItem(
      STORAGE_KEY,
    );
  } finally {
    workspaceLoaded.current = true;
  }
}, []);

  /*
   * ------------------------------------------------------
   * SAVE WORKSPACE
   * ------------------------------------------------------
   */

  useEffect(() => {
    if (!workspaceLoaded.current) {
  return;
}

    const snapshot: WorkspaceSnapshot = {
      version: 2,
      schools,
      emailResults,
      selectedRecipientIds,
      processedSchoolIds,
      stateFilter,
      districtFilter,
      emailFilter,
      batchNumber,
      schoolTablePage,
      emailTablePage,
      hasMoreSchoolBatches,
      hasFetched,
    };

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(snapshot),
      );
    } catch {
      // Non-fatal.
    }
  }, [
    workspaceLoaded,
    schools,
    emailResults,
    selectedRecipientIds,
    processedSchoolIds,
    stateFilter,
    districtFilter,
    emailFilter,
    batchNumber,
    schoolTablePage,
    emailTablePage,
    hasMoreSchoolBatches,
    hasFetched,
  ]);

  /*
   * ------------------------------------------------------
   * LOAD CBSE FILTERS
   * ------------------------------------------------------
   *
   * This NEVER runs while CBSE is locked.
   */

  useEffect(() => {
    if (cbseUnlocked !== true) {
      return;
    }

    let active = true;

    async function loadFilters() {
      setFilterLoading(true);
      setFilterError("");

      try {
        const query = stateFilter
          ? `?state=${encodeURIComponent(
              stateFilter,
            )}`
          : "";

        const response = await fetch(
          `/api/directories/import${query}`,
          {
            cache: "no-store",
          },
        );

        const payload =
          (await response.json()) as FilterResponse;

        if (response.status === 401) {
          setCbseUnlocked(false);

          throw new Error(
            "CBSE access session expired. Please unlock again.",
          );
        }

        if (!response.ok) {
          throw new Error(
            typeof payload.error ===
              "string"
              ? payload.error
              : "Unable to load directory filters.",
          );
        }

        if (active) {
          setStateOptions(
            normalizeFilterOptions(
              payload.states,
            ),
          );

          setDistrictOptions(
            normalizeFilterOptions(
              payload.districts,
            ),
          );
        }
      } catch (error) {
        if (active) {
          setFilterError(
            error instanceof Error
              ? error.message
              : "Unable to load directory filters.",
          );
        }
      } finally {
        if (active) {
          setFilterLoading(false);
        }
      }
    }

    void loadFilters();

    return () => {
      active = false;
    };
  }, [
    cbseUnlocked,
    stateFilter,
  ]);

  /*
   * ------------------------------------------------------
   * UNLOCK CBSE
   * ------------------------------------------------------
   */

  async function handleUnlock() {
    const code = accessCode.trim();

    if (!code) {
      setAccessError(
        "Enter the CBSE access code.",
      );
      return;
    }

    setIsUnlocking(true);
    setAccessError("");

    try {
      const response = await fetch(
        "/api/cbse/unlock",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            code,
          }),
        },
      );

      const payload =
        (await response.json()) as {
          error?: unknown;
        };

      if (!response.ok) {
        throw new Error(
          typeof payload.error ===
            "string"
            ? payload.error
            : "Unable to unlock CBSE access.",
        );
      }

      setAccessCode("");
      setCbseUnlocked(true);
    } catch (error) {
      setAccessError(
        error instanceof Error
          ? error.message
          : "Unable to unlock CBSE access.",
      );
    } finally {
      setIsUnlocking(false);
    }
  }

  /*
   * ------------------------------------------------------
   * RESET
   * ------------------------------------------------------
   */

  function resetCollection() {
    setSchools([]);
    setBatchNumber(1);
    setSchoolTablePage(1);
    setHasMoreSchoolBatches(true);

    setEmailResults([]);
    setSelectedRecipientIds([]);
    setProcessedSchoolIds([]);

    setEmailTablePage(1);
    setHasFetched(false);

    setFetchMessage("");
    setFetchError("");

    setScrapeMessage("");
    setScrapeError("");

    setExportError("");
  }

  function clearSavedWorkspace() {
    if (
      !window.confirm(
        "Clear the saved workspace and all loaded results?",
      )
    ) {
      return;
    }

    window.localStorage.removeItem(
      STORAGE_KEY,
    );

    resetCollection();

    setStateFilter("");
    setDistrictFilter("");
  }

  /*
   * ------------------------------------------------------
   * FETCH SCHOOLS
   * ------------------------------------------------------
   */

  async function handleFetchSchools(
    loadNextBatch = false,
  ) {
    if (cbseUnlocked !== true) {
      setFetchError(
        "Unlock CBSE access before requesting schools.",
      );
      return;
    }

    setIsFetching(true);
    setFetchMessage("");
    setFetchError("");

    if (!loadNextBatch) {
      setSchools([]);
      setSchoolTablePage(1);
      setHasMoreSchoolBatches(true);
      setProcessedSchoolIds([]);
      setBatchNumber(1);
    } else {
      setBatchNumber(
        (currentBatch) =>
          currentBatch + 1,
      );
    }

    setEmailResults([]);
    setSelectedRecipientIds([]);
    setEmailTablePage(1);

    setScrapeProgress({
      completed: 0,
      total: 0,
    });

    setScrapeMessage("");
    setScrapeError("");
    setExportError("");

    try {
      const response = await fetch(
        "/api/directories/import",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            board: "CBSE",
            limit: SCHOOL_BATCH_SIZE,
            randomize: true,
            state:
              stateFilter || undefined,
            district:
              districtFilter || undefined,
            excludeSchoolCodes:
              loadNextBatch
                ? schools.map(
                    (school) =>
                      school.schoolCode ??
                      school.schoolName,
                  )
                : [],
          }),
        },
      );

      const payload =
        await readImportResponse(
          response,
        );

      if (response.status === 401) {
        setCbseUnlocked(false);

        throw new Error(
          "CBSE access session expired. Please unlock again.",
        );
      }

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "The directory request failed.",
        );
      }

      setSchools(
        (currentSchools) =>
          loadNextBatch
            ? [
                ...currentSchools,
                ...payload.schools,
              ]
            : payload.schools,
      );

      setHasMoreSchoolBatches(
        payload.schools.length ===
          SCHOOL_BATCH_SIZE,
      );

      setHasFetched(true);

      setFetchMessage(
        payload.schools.length > 0
          ? `Batch ${
              loadNextBatch
                ? batchNumber + 1
                : 1
            }: ${
              payload.schools.length
            } CBSE schools loaded.`
          : "No CBSE schools were returned.",
      );

      if (loadNextBatch) {
        setSchoolTablePage(
          Math.max(
            1,
            Math.ceil(
              (schools.length +
                payload.schools.length) /
                SCHOOL_BATCH_SIZE,
            ),
          ),
        );
      }
    } catch (error) {
      setFetchError(
        error instanceof Error
          ? error.message
          : "The directory request failed.",
      );
    } finally {
      setIsFetching(false);
    }
  }

  /*
   * ------------------------------------------------------
   * EMAIL SCRAPING
   * ------------------------------------------------------
   */

  async function handleStartScraping() {
    const processedIds = new Set(
      processedSchoolIds,
    );

    const schoolsToProcess =
      schools.filter(
        (school) =>
          !processedIds.has(
            getSchoolId(school),
          ),
      );

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

    setScrapeProgress({
      completed: 0,
      total: schoolsToProcess.length,
    });

    setScrapeMessage("");
    setScrapeError("");
    setEmailTablePage(1);
    setSelectedRecipientIds([]);

    const nextResults: EmailResult[] =
      [...emailResults];

    const seenEmails = new Set(
      emailResults
        .filter(
          (result) =>
            result.email !== "-",
        )
        .map((result) =>
          result.email.toLowerCase(),
        ),
    );

    for (
      const [index, school] of
        schoolsToProcess.entries()
    ) {
      if (!school.website) {
        nextResults.push({
          board: "CBSE",
          schoolName:
            school.schoolName,
          affiliationNumber:
            school.affiliationNumber,
          schoolCode:
            school.schoolCode,
          state: school.state,
          district:
            school.district,
          city: school.city,
          website: "-",
          email: "-",
          sourcePage: "-",
          status: "No email",
          error:
            "No website available.",
        });

        setEmailResults([
          ...nextResults,
        ]);

        setProcessedSchoolIds(
          (currentIds) => [
            ...currentIds,
            getSchoolId(school),
          ],
        );

        setScrapeProgress({
          completed:
            index + 1,
          total:
            schoolsToProcess.length,
        });

        continue;
      }

      try {
        const response =
          await fetch(
            "/api/scraper/email",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                url: school.website,
              }),
            },
          );

        const payload =
          await readWebsiteScrapeResponse(
            response,
          );

        if (!response.ok) {
          throw new Error(
            payload.error ??
              "Website scraping failed.",
          );
        }

        let addedEmail = false;

        for (
          const websiteEmail of
            payload.emails
        ) {
          const emailKey =
            websiteEmail.email.toLowerCase();

          if (
            seenEmails.has(emailKey)
          ) {
            continue;
          }

          seenEmails.add(emailKey);
          addedEmail = true;

          nextResults.push({
            board: "CBSE",
            schoolName:
              school.schoolName,
            affiliationNumber:
              school.affiliationNumber,
            schoolCode:
              school.schoolCode,
            state: school.state,
            district:
              school.district,
            city: school.city,
            website:
              school.website,
            email:
              websiteEmail.email,
            sourcePage:
              websiteEmail.sourcePage,
            status:
              payload.status ===
              "failed"
                ? "Failed"
                : payload.status ===
                    "partial"
                  ? "Partial"
                  : "Success",
            error:
              payload.error,
          });
        }

        if (!addedEmail) {
          nextResults.push({
            board: "CBSE",
            schoolName:
              school.schoolName,
            affiliationNumber:
              school.affiliationNumber,
            schoolCode:
              school.schoolCode,
            state: school.state,
            district:
              school.district,
            city: school.city,
            website:
              school.website,
            email: "-",
            sourcePage: "-",
            status:
              payload.status ===
              "failed"
                ? "Failed"
                : payload.status ===
                    "partial"
                  ? "Partial"
                  : "No email",
            error:
              payload.error,
          });
        }
      } catch (error) {
        nextResults.push({
          board: "CBSE",
          schoolName:
            school.schoolName,
          affiliationNumber:
            school.affiliationNumber,
          schoolCode:
            school.schoolCode,
          state: school.state,
          district:
            school.district,
          city: school.city,
          website:
            school.website,
          email: "-",
          sourcePage: "-",
          status: "Failed",
          error:
            error instanceof Error
              ? error.message
              : "Website scraping failed.",
        });

        console.warn(
          `[dashboard] Email scraping failed for ${school.schoolName}`,
          error,
        );
      }

      setEmailResults([
        ...nextResults,
      ]);

      setProcessedSchoolIds(
        (currentIds) => [
          ...currentIds,
          getSchoolId(school),
        ],
      );

      setScrapeProgress({
        completed:
          index + 1,
        total:
          schoolsToProcess.length,
      });
    }

    const foundEmails =
      nextResults.filter(
        (result) =>
          result.status ===
          "Success",
      ).length;

    setScrapeMessage(
      `${schoolsToProcess.length} school${
        schoolsToProcess.length ===
        1
          ? ""
          : "s"
      } processed. ${foundEmails} email${
        foundEmails === 1
          ? ""
          : "s"
      } found.`,
    );

    setIsScraping(false);
  }

  /*
   * ------------------------------------------------------
   * EXPORT
   * ------------------------------------------------------
   */

  async function handleDownloadExcel() {
    if (selectedCount === 0) {
      setExportError(
        "Select at least one successful recipient before exporting.",
      );
      return;
    }

    setIsExporting(true);
    setExportError("");

    try {
      const response =
        await fetch(
          "/api/export",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              results:
                selectedRecipients,
            }),
          },
        );

      if (!response.ok) {
        let message =
          "Excel export failed.";

        try {
          const payload =
            (await response.json()) as ExportResponse;

          if (
            typeof payload.error ===
            "string"
          ) {
            message =
              payload.error;
          }
        } catch {
          // Fallback message.
        }

        throw new Error(message);
      }

      const blob =
        await response.blob();

      const downloadUrl =
        URL.createObjectURL(blob);

      const link =
        document.createElement(
          "a",
        );

      link.href = downloadUrl;
      link.download =
        "school-emails.xlsx";

      document.body.appendChild(
        link,
      );

      link.click();
      link.remove();

      URL.revokeObjectURL(
        downloadUrl,
      );
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Excel export failed.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  function toggleRecipient(
    result: EmailResult,
  ) {
    if (
      result.status !== "Success"
    ) {
      return;
    }

    const id =
      getRecipientId(result);

    setSelectedRecipientIds(
      (currentIds) =>
        currentIds.includes(id)
          ? currentIds.filter(
              (currentId) =>
                currentId !== id,
            )
          : [
              ...currentIds,
              id,
            ],
    );
  }

  function toggleVisibleRecipients() {
    const visibleIds =
      selectableFilteredResults.map(
        getRecipientId,
      );

    setSelectedRecipientIds(
      (currentIds) => {
        if (
          allFilteredSelected
        ) {
          return currentIds.filter(
            (id) =>
              !visibleIds.includes(
                id,
              ),
          );
        }

        return [
          ...new Set([
            ...currentIds,
            ...visibleIds,
          ]),
        ];
      },
    );
  }

  function clearSelection() {
    setSelectedRecipientIds([]);
  }

  /*
   * ------------------------------------------------------
   * INITIAL SESSION CHECK
   * ------------------------------------------------------
   */

  if (cbseUnlocked === null) {
    return (
      <AccessShell>
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--navy)] text-lg font-bold text-white">
            CB
          </div>

          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--orange)]">
            School Email Scraper
          </p>

          <h1 className="mt-2 text-2xl font-semibold text-[var(--navy)]">
            Checking access
          </h1>

          <p className="mt-2 text-sm text-[var(--muted)]">
            Verifying the current CBSE access session.
          </p>
        </div>
      </AccessShell>
    );
  }

  /*
   * ------------------------------------------------------
   * ACCESS GATE
   * ------------------------------------------------------
   */

  if (!cbseUnlocked) {
    return (
      <AccessShell>
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--navy)] text-lg font-bold text-white">
            CB
          </div>

          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--orange)]">
            Protected Directory
          </p>

          <h1 className="mt-2 text-2xl font-semibold text-[var(--navy)]">
            CBSE access required
          </h1>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
            Enter the authorized access code to
            unlock the CBSE school directory.
          </p>
        </div>

        <div className="mx-auto mt-7 max-w-md">
          <label className="block text-xs font-semibold text-[var(--navy)]">
            Access code

            <input
              type="password"
              value={accessCode}
              onChange={(event) => {
                setAccessCode(
                  event.target.value,
                );
                setAccessError("");
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                ) {
                  void handleUnlock();
                }
              }}
              autoComplete="off"
              placeholder="Enter access code"
              className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-4 text-sm text-[var(--navy)] outline-none focus:border-[var(--blue)] focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <button
            type="button"
            onClick={() =>
              void handleUnlock()
            }
            disabled={
              isUnlocking ||
              !accessCode.trim()
            }
            className="mt-3 h-11 w-full rounded-xl bg-[var(--navy)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUnlocking
              ? "Unlocking..."
              : "Unlock CBSE Access"}
          </button>

          {accessError && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-[#fde9e6] px-3 py-2 text-xs font-medium text-[#b5483f]"
            >
              {accessError}
            </p>
          )}

          <p className="mt-5 text-center text-[11px] leading-5 text-[var(--muted)]">
            Access is controlled by the server and
            expires automatically.
          </p>
        </div>
      </AccessShell>
    );
  }

  /*
   * ------------------------------------------------------
   * MAIN DASHBOARD
   * ------------------------------------------------------
   */

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-3 px-5 py-5 lg:px-8">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] pb-3">
          <div>
            <p className="text-sm font-semibold text-[var(--navy)]">
              School Email Scraper
            </p>

            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              CBSE institutional contact workspace
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[var(--green)]">
              Saved locally
            </span>

            <span className="rounded-lg bg-[var(--pale-blue)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--blue)]">
              CBSE unlocked
            </span>

            <button
              type="button"
              onClick={
                clearSavedWorkspace
              }
              disabled={isBusy}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[11px] font-semibold text-[var(--muted)] transition hover:border-[#b5483f] hover:text-[#b5483f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear Workspace
            </button>
          </div>
        </header>

        {/* Directory Controls */}
        <section className="grid shrink-0 gap-3 lg:grid-cols-[1.35fr_0.8fr]">
          <div className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-[0_6px_20px_rgba(21,44,67,0.04)]">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                  01 / Directory
                </p>

                <h2 className="mt-1 text-base font-semibold text-[var(--navy)]">
                  Fetch CBSE schools
                  <span className="text-xs font-medium text-[var(--muted)]">
                    {" "}
                    / batch {batchNumber}
                  </span>
                </h2>
              </div>

              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  isFetching
                    ? "bg-[#fff0df] text-[var(--orange)]"
                    : "bg-[var(--pale-blue)] text-[var(--blue)]"
                }`}
              >
                {isFetching
                  ? "Fetching"
                  : "Ready"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[0.75fr_1.2fr_1.2fr_130px]">
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-[var(--navy)]">
                  Board
                </legend>

                <div className="flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-3 text-xs font-semibold text-[var(--navy)]">
                  CBSE directory
                </div>
              </fieldset>

              <label className="text-xs font-medium text-[var(--navy)]">
                State

                <select
                  value={stateFilter}
                  disabled={
                    isBusy ||
                    filterLoading
                  }
                  onChange={(event) => {
                    resetCollection();
                    setDistrictFilter("");
                    setStateFilter(
                      event.target.value,
                    );
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-xs font-semibold outline-none focus:border-[var(--blue)] focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">
                    All states
                  </option>

                  {stateOptions.map(
                    (option) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {
                          option.label
                        }
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="text-xs font-medium text-[var(--navy)]">
                District

                <select
                  value={districtFilter}
                  disabled={
                    isBusy ||
                    !stateFilter ||
                    filterLoading
                  }
                  onChange={(event) => {
                    resetCollection();
                    setDistrictFilter(
                      event.target.value,
                    );
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-xs font-semibold outline-none focus:border-[var(--blue)] focus:ring-4 focus:ring-blue-100 disabled:bg-[var(--canvas)] disabled:text-[var(--muted)]"
                >
                  <option value="">
                    All districts
                  </option>

                  {districtOptions.map(
                    (option) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {
                          option.label
                        }
                      </option>
                    ),
                  )}
                </select>
              </label>

              <div>
                <label className="text-xs font-medium text-[var(--navy)]">
                  Schools per batch
                </label>

                <div className="mt-1 flex h-9 items-center rounded-lg border border-[var(--line)] bg-white px-3 text-xs font-semibold text-[var(--navy)]">
                  {SCHOOL_BATCH_SIZE}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  void handleFetchSchools()
                }
                disabled={isBusy}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--navy)] px-4 text-xs font-semibold text-white transition hover:bg-[var(--blue)] disabled:cursor-wait disabled:opacity-70"
              >
                {isFetching
                  ? "Fetching Schools..."
                  : "Fetch Schools"}

                {!isFetching && (
                  <span
                    aria-hidden="true"
                    className="ml-2 text-base"
                  >
                    -&gt;
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  void handleFetchSchools(
                    true,
                  )
                }
                disabled={
                  isBusy ||
                  !hasFetched ||
                  !hasMoreSchoolBatches
                }
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--navy)] px-4 text-xs font-semibold text-[var(--navy)] transition hover:bg-[var(--canvas)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Fetch Next 20
              </button>

              {fetchMessage && (
                <p className="text-xs font-medium text-[var(--green)]">
                  {fetchMessage}
                </p>
              )}

              {fetchError && (
                <p
                  role="alert"
                  className="text-xs font-medium text-[#b5483f]"
                >
                  {fetchError}
                </p>
              )}

              {filterError && (
                <p
                  role="alert"
                  className="text-xs font-medium text-[#b5483f]"
                >
                  {filterError}
                </p>
              )}
            </div>
          </div>

          {/* Pipeline status */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--navy)] p-4 text-white shadow-[0_6px_20px_rgba(21,44,67,0.06)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9fb5c7]">
              Pipeline status
            </p>

            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold">
                  {schools.length}
                </p>

                <p className="mt-1 text-xs text-[#b3c4d1]">
                  schools in workspace
                </p>
              </div>

              <div className="text-right">
                <p className="text-xl font-semibold">
                  {foundEmailCount}
                </p>

                <p className="mt-1 text-xs text-[#b3c4d1]">
                  emails found
                </p>
              </div>
            </div>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#314b62]">
              <div
                className="h-full rounded-full bg-[var(--orange)] transition-all"
                style={{
                  width:
                    isScraping &&
                    scrapeProgress.total > 0
                      ? `${
                          (scrapeProgress.completed /
                            scrapeProgress.total) *
                          100
                        }%`
                      : hasFetched
                        ? "100%"
                        : "0%",
                }}
              />
            </div>

            <p className="mt-2 text-[11px] text-[#b3c4d1]">
              {isFetching
                ? "Directory request in progress..."
                : isScraping
                  ? `Scraping ${scrapeProgress.completed} of ${scrapeProgress.total} websites...`
                  : hasFetched
                    ? "Latest directory request complete."
                    : "No directory data has been collected yet."}
            </p>
          </div>
        </section>

        {/* Result panels */}
        <div className="grid min-h-0 gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Schools */}
          <section className="flex min-h-[480px] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_6px_20px_rgba(21,44,67,0.04)]">
            <div className="flex flex-col gap-2 border-b border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Directory results
                </p>

                <h2 className="mt-0.5 text-base font-semibold text-[var(--navy)]">
                  Schools
                  <span className="text-xs font-medium text-[var(--muted)]">
                    {" "}
                    / batch {batchNumber}
                  </span>
                </h2>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-[var(--muted)]">
                <span>
                  {schools.length} records
                </span>

                {stateFilter && (
                  <span className="rounded-md bg-[var(--pale-blue)] px-2 py-1 font-semibold text-[var(--blue)]">
                    State:{" "}
                    {optionLabel(
                      stateOptions,
                      stateFilter,
                    )}
                  </span>
                )}

                {districtFilter && (
                  <span className="rounded-md bg-[var(--pale-blue)] px-2 py-1 font-semibold text-[var(--blue)]">
                    District:{" "}
                    {optionLabel(
                      districtOptions,
                      districtFilter,
                    )}
                  </span>
                )}
              </div>
            </div>

            <TableShell
              headers={[
                "Board",
                "School Name",
                "State",
                "District",
                "City",
              ]}
            >
              {schools.length > 0 ? (
                visibleSchools.map(
                  (school) => (
                    <tr
                      key={`${school.board}-${school.schoolCode ?? school.schoolName}`}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-[var(--blue)]">
                        {school.board}
                      </td>

                      <td className="max-w-[220px] px-3 py-2 font-medium text-[var(--navy)]">
                        <span
                          className="block truncate"
                          title={
                            school.schoolName
                          }
                        >
                          {
                            school.schoolName
                          }
                        </span>
                      </td>

                      <td className="px-3 py-2 text-[var(--muted)]">
                        {school.state ??
                          "-"}
                      </td>

                      <td className="px-3 py-2 text-[var(--muted)]">
                        {school.district ??
                          "-"}
                      </td>

                      <td className="px-3 py-2 text-[var(--muted)]">
                        {school.city ??
                          "-"}
                      </td>
                    </tr>
                  ),
                )
              ) : (
                <EmptyRow
                  columns={5}
                  message={
                    isFetching
                      ? "Loading schools..."
                      : hasFetched
                        ? "No schools found for this request."
                        : "Fetched schools will appear here."
                  }
                />
              )}
            </TableShell>

            {schools.length > 0 && (
              <Pagination
                page={schoolTablePage}
                pageCount={schoolPageCount}
                disabled={isBusy}
                onPrevious={() =>
                  setSchoolTablePage(
                    (page) =>
                      Math.max(
                        1,
                        page - 1,
                      ),
                  )
                }
                onNext={() =>
                  setSchoolTablePage(
                    (page) =>
                      Math.min(
                        schoolPageCount,
                        page + 1,
                      ),
                  )
                }
              />
            )}
          </section>

          {/* Emails */}
          <section className="flex min-h-[480px] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_6px_20px_rgba(21,44,67,0.04)]">
            <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--orange)]">
                  02 / Extraction
                </p>

                <h2 className="mt-0.5 text-base font-semibold text-[var(--navy)]">
                  Email Scraping
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <div className="flex items-center rounded-lg border border-[var(--line)] bg-[var(--canvas)] p-0.5">
                  {(
                    [
                      "all",
                      "success",
                      "selected",
                    ] as const
                  ).map(
                    (filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => {
                          setEmailFilter(
                            filter,
                          );
                          setEmailTablePage(
                            1,
                          );
                        }}
                        disabled={isBusy}
                        className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold capitalize transition ${
                          emailFilter ===
                          filter
                            ? "bg-white text-[var(--navy)] shadow-sm"
                            : "text-[var(--muted)] hover:text-[var(--navy)]"
                        }`}
                      >
                        {filter ===
                        "success"
                          ? "Successful"
                          : filter}
                      </button>
                    ),
                  )}
                </div>

                <span className="text-xs font-semibold text-[var(--navy)]">
                  Selected:{" "}
                  {selectedCount}
                </span>

                <button
                  type="button"
                  onClick={
                    handleStartScraping
                  }
                  disabled={
                    isBusy ||
                    schools.length === 0
                  }
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--navy)] px-4 text-xs font-semibold text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isScraping
                    ? `Scraping ${scrapeProgress.completed}/${scrapeProgress.total}`
                    : "Start Email Scraping"}

                  {!isScraping && (
                    <span
                      aria-hidden="true"
                      className="ml-2 text-base"
                    >
                      -&gt;
                    </span>
                  )}
                </button>
              </div>
            </div>

            {isScraping && (
              <div className="border-b border-[var(--line)] px-6 py-3">
                <div className="mb-2 flex justify-between text-xs font-medium text-[var(--muted)]">
                  <span>
                    Processing websites
                  </span>

                  <span>
                    {
                      scrapeProgress.completed
                    }
                    /
                    {
                      scrapeProgress.total
                    }
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-[var(--canvas)]">
                  <div
                    className="h-full rounded-full bg-[var(--orange)] transition-all"
                    style={{
                      width:
                        scrapeProgress.total >
                          0
                          ? `${
                              (scrapeProgress.completed /
                                scrapeProgress.total) *
                              100
                            }%`
                          : "0%",
                    }}
                  />
                </div>
              </div>
            )}

            {(scrapeMessage ||
              scrapeError) && (
              <div className="border-b border-[var(--line)] px-4 py-2.5">
                {scrapeMessage && (
                  <p className="text-xs font-medium text-[var(--orange)]">
                    {scrapeMessage}
                  </p>
                )}

                {scrapeError && (
                  <p
                    role="alert"
                    className="mt-1 text-xs font-medium text-[#b5483f]"
                  >
                    {scrapeError}
                  </p>
                )}
              </div>
            )}

            <TableShell
              headers={[
                "Select",
                "Board",
                "School Name",
                "Website",
                "Email",
                "Source",
                "Status",
              ]}
            >
              {filteredEmailResults.length >
              0 ? (
                visibleEmailResults.map(
                  (result, index) => (
                    <tr
                      key={`${result.board}-${result.schoolName}-${result.email}-${index}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${result.email}`}
                          checked={
                            result.status ===
                              "Success" &&
                            selectedRecipientIds.includes(
                              getRecipientId(
                                result,
                              ),
                            )
                          }
                          onChange={() =>
                            toggleRecipient(
                              result,
                            )
                          }
                          disabled={
                            isBusy ||
                            result.status !==
                              "Success"
                          }
                          className="size-4 accent-[var(--navy)] disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </td>

                      <td className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-[var(--blue)]">
                        {result.board}
                      </td>

                      <td className="max-w-[180px] px-3 py-2 font-medium text-[var(--navy)]">
                        <span
                          className="block truncate"
                          title={
                            result.schoolName
                          }
                        >
                          {
                            result.schoolName
                          }
                        </span>
                      </td>

                      <td className="max-w-[170px] px-3 py-2">
                        {result.website ===
                        "-" ? (
                          <span className="text-[var(--muted)]">
                            -
                          </span>
                        ) : (
                          <a
                            href={
                              result.website
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-[var(--blue)] hover:underline"
                            title={
                              result.website
                            }
                          >
                            {
                              result.website
                            }
                          </a>
                        )}
                      </td>

                      <td className="max-w-[170px] px-3 py-2">
                        {result.email ===
                        "-" ? (
                          <span className="text-[var(--muted)]">
                            -
                          </span>
                        ) : (
                          <a
                            href={`mailto:${result.email}`}
                            className="font-medium text-[var(--blue)] hover:underline"
                          >
                            {
                              result.email
                            }
                          </a>
                        )}
                      </td>

                      <td className="max-w-[170px] px-3 py-2">
                        {result.sourcePage ===
                        "-" ? (
                          <span className="text-[var(--muted)]">
                            -
                          </span>
                        ) : (
                          <a
                            href={
                              result.sourcePage
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-[var(--blue)] hover:underline"
                            title={
                              result.sourcePage
                            }
                          >
                            Scraped
                          </a>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <span
                          title={
                            result.error
                          }
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            result.status ===
                            "Success"
                              ? "bg-[var(--mint)] text-[var(--green)]"
                              : result.status ===
                                  "Failed"
                                ? "bg-[#fde9e6] text-[#b5483f]"
                                : result.status ===
                                    "Partial"
                                  ? "bg-[#fff0df] text-[var(--orange)]"
                                  : "bg-[var(--canvas)] text-[var(--muted)]"
                          }`}
                        >
                          {
                            result.status
                          }
                        </span>
                      </td>
                    </tr>
                  ),
                )
              ) : (
                <EmptyRow
                  columns={7}
                  message={
                    isScraping
                      ? "Email results will appear as websites finish."
                      : emailFilter ===
                          "success"
                        ? "No successful email results yet."
                        : emailFilter ===
                            "selected"
                          ? "No recipients selected yet."
                          : "Extracted email addresses will appear here."
                  }
                />
              )}
            </TableShell>

            {emailResults.length >
              0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2 text-[11px]">
                <label className="inline-flex items-center gap-2 font-semibold text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={
                      allFilteredSelected
                    }
                    onChange={
                      toggleVisibleRecipients
                    }
                    disabled={
                      isBusy ||
                      selectableFilteredResults.length ===
                        0
                    }
                    className="size-4 accent-[var(--navy)] disabled:opacity-30"
                  />

                  Select All
                </label>

                <button
                  type="button"
                  onClick={
                    clearSelection
                  }
                  disabled={
                    isBusy ||
                    selectedCount === 0
                  }
                  className="font-semibold text-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear Selection
                </button>
              </div>
            )}

            {emailResults.length >
              0 && (
              <Pagination
                page={emailTablePage}
                pageCount={emailPageCount}
                disabled={isBusy}
                onPrevious={() =>
                  setEmailTablePage(
                    (page) =>
                      Math.max(
                        1,
                        page - 1,
                      ),
                  )
                }
                onNext={() =>
                  setEmailTablePage(
                    (page) =>
                      Math.min(
                        emailPageCount,
                        page + 1,
                      ),
                  )
                }
              />
            )}
          </section>
        </div>

        {/* Export */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={
              handleDownloadExcel
            }
            disabled={
              isBusy ||
              selectedCount === 0
            }
            className="inline-flex h-9 items-center rounded-lg px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:bg-[#dbe2e8] disabled:text-[#8997a2] enabled:bg-[var(--navy)] enabled:text-white enabled:hover:bg-[var(--blue)]"
          >
            {isExporting
              ? "Preparing Excel..."
              : "Export Selected"}

            {!isExporting && (
              <span
                aria-hidden="true"
                className="ml-2 text-base"
              >
                &#8595;
              </span>
            )}
          </button>

          {exportError && (
            <p
              role="alert"
              className="text-xs font-medium text-[#b5483f]"
            >
              {exportError}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

/*
 * --------------------------------------------------------
 * COMPONENTS
 * --------------------------------------------------------
 */

function AccessShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-5 py-10">
        <div className="w-full rounded-2xl border border-[var(--line)] bg-white p-8 shadow-[0_12px_35px_rgba(21,44,67,0.08)]">
          {children}
        </div>
      </div>
    </main>
  );
}

function TableShell({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--canvas)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
          <tr>
            {headers.map(
              (header) => (
                <th
                  key={header}
                  className="whitespace-nowrap px-3 py-2.5 font-semibold"
                >
                  {header}
                </th>
              ),
            )}
          </tr>
        </thead>

        <tbody className="divide-y divide-[var(--line)] [&>tr]:transition-colors [&>tr:hover]:bg-[var(--canvas)]">
          {children}
        </tbody>
      </table>
    </div>
  );
}

function EmptyRow({
  columns,
  message,
}: {
  columns: number;
  message: string;
}) {
  return (
    <tr>
      <td
        colSpan={columns}
        className="px-6 py-12 text-center text-sm text-[var(--muted)]"
      >
        {message}
      </td>
    </tr>
  );
}

function Pagination({
  page,
  pageCount,
  disabled,
  onPrevious,
  onNext,
}: {
  page: number;
  pageCount: number;
  disabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-2.5 text-[11px] text-[var(--muted)]">
      <span>
        Page {page} of {pageCount}
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={
            disabled ||
            page === 1
          }
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 font-semibold text-[var(--navy)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={
            disabled ||
            page === pageCount
          }
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 font-semibold text-[var(--navy)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/*
 * --------------------------------------------------------
 * HELPERS
 * --------------------------------------------------------
 */

function getSchoolId(
  school: SchoolRecord,
): string {
  return (
    school.schoolCode ??
    school.schoolName
  );
}

function getRecipientId(
  result: EmailResult,
): string {
  return `recipient:${result.email.toLowerCase()}`;
}

function normalizeFilterOptions(
  value: unknown,
): FilterOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      option,
    ): option is FilterOption =>
      typeof option === "object" &&
      option !== null &&
      "value" in option &&
      "label" in option &&
      typeof option.value ===
        "string" &&
      typeof option.label ===
        "string",
  );
}

function optionLabel(
  options: FilterOption[],
  value: string,
): string {
  return (
    options.find(
      (option) =>
        option.value ===
        value,
    )?.label ?? value
  );
}

function isWorkspaceSnapshot(
  value: unknown,
): value is WorkspaceSnapshot {
  if (
    !isRecord(value) ||
    value.version !== 2
  ) {
    return false;
  }

  return (
    Array.isArray(value.schools) &&
    value.schools.every(
      isSchoolRecord,
    ) &&
    Array.isArray(
      value.emailResults,
    ) &&
    value.emailResults.every(
      isEmailResult,
    ) &&
    isStringArray(
      value.selectedRecipientIds,
    ) &&
    isStringArray(
      value.processedSchoolIds,
    ) &&
    typeof value.stateFilter ===
      "string" &&
    typeof value.districtFilter ===
      "string" &&
    (
      value.emailFilter ===
        "all" ||
      value.emailFilter ===
        "success" ||
      value.emailFilter ===
        "selected"
    ) &&
    isPositiveInteger(
      value.batchNumber,
    ) &&
    isPositiveInteger(
      value.schoolTablePage,
    ) &&
    isPositiveInteger(
      value.emailTablePage,
    ) &&
    typeof value
      .hasMoreSchoolBatches ===
      "boolean" &&
    typeof value.hasFetched ===
      "boolean"
  );
}

function isSchoolRecord(
  value: unknown,
): value is SchoolRecord {
  return (
    isRecord(value) &&
    value.board === "CBSE" &&
    typeof value.schoolName ===
      "string"
  );
}

function isEmailResult(
  value: unknown,
): value is EmailResult {
  return (
    isRecord(value) &&
    value.board === "CBSE" &&
    typeof value.schoolName ===
      "string" &&
    typeof value.website ===
      "string" &&
    typeof value.email ===
      "string" &&
    typeof value.sourcePage ===
      "string" &&
    (
      value.status ===
        "Success" ||
      value.status ===
        "No email" ||
      value.status ===
        "Partial" ||
      value.status ===
        "Failed"
    )
  );
}

function isStringArray(
  value: unknown,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item ===
        "string",
    )
  );
}

function isPositiveInteger(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(
      value,
    ) &&
    value >= 1
  );
}

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value === "object" &&
    value !== null
  );
}