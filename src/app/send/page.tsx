"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "school-email-scraper:workspace:v1";

type CampaignRecipient = {
  email: string;
  school: string;
  state: string;
  district: string;
  sourcePage: string;
};

type Template = {
  id: string;
  name: string;
  description: string;
  defaultSubject: string;
  defaultPreheader: string;
  accent: string;
};

type SavedWorkspace = {
  version?: unknown;
  emailResults?: unknown;
  selectedRecipientIds?: unknown;
  templateSelection?: unknown;
  subject?: unknown;
  previewText?: unknown;
  title?: unknown;
  intro?: unknown;
  body?: unknown;
  ctaText?: unknown;
  ctaUrl?: unknown;
  fromName?: unknown;
  fromEmail?: unknown;
};

const TEMPLATES: Template[] = [
  {
    id: "school-partnership",
    name: "School Introduction",
    description: "A professional introduction for school partnership conversations.",
    defaultSubject: "Explore a school partnership opportunity",
    defaultPreheader: "A practical way to support your school community.",
    accent: "#2864a3",
  },
  {
    id: "product-catalogue",
    name: "Product Catalogue",
    description: "Share a focused catalogue of educational products for schools.",
    defaultSubject: "2024\u201325 Educational product catalogue",
    defaultPreheader: "Browse resources selected for schools and educators.",
    accent: "#d97735",
  },
  {
    id: "educational-resources",
    name: "Educational Resources",
    description: "Introduce useful teaching and learning resources.",
    defaultSubject: "New educational resources for your school",
    defaultPreheader: "Explore resources designed for better learning outcomes.",
    accent: "#26735d",
  },
];

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function isEmailResult(
  value: unknown,
): value is {
  email: string;
  schoolName: string;
  state?: string;
  district?: string;
  sourcePage: string;
  status: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    typeof (value as Record<string, unknown>).email === "string" &&
    "schoolName" in value &&
    typeof (value as Record<string, unknown>).schoolName === "string" &&
    "sourcePage" in value &&
    typeof (value as Record<string, unknown>).sourcePage === "string" &&
    "status" in value &&
    typeof (value as Record<string, unknown>).status === "string"
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 h-9 text-sm text-[var(--navy)] outline-none focus:border-[var(--blue)] focus:ring-4 focus:ring-blue-100";

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-[var(--navy)]">
      {label}
      {children}
    </label>
  );
}

function ActionButton({
  onClick,
  status,
  label,
  primary,
}: {
  onClick: () => void;
  status: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-lg px-4 text-xs font-semibold transition ${
        primary
          ? "bg-[var(--navy)] text-white hover:bg-[var(--blue)]"
          : "border border-[var(--line)] bg-white text-[var(--navy)] hover:bg-[var(--canvas)]"
      }`}
    >
      {status || label}
    </button>
  );
}

export default function TemplatePage() {
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [templateId, setTemplateId] = useState("educational-resources");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [headline, setHeadline] = useState("");
  const [intro, setIntro] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("View Full Catalogue");
  const [ctaUrl, setCtaUrl] = useState("/catalog");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [copySubjectStatus, setCopySubjectStatus] = useState("");
  const [copyPreheaderStatus, setCopyPreheaderStatus] = useState("");
  const [copyHtmlStatus, setCopyHtmlStatus] = useState("");
  const [showRecipients, setShowRecipients] = useState(false);
  const previewController = useRef<AbortController | null>(null);

  // Load workspace from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const workspace = raw ? (JSON.parse(raw) as SavedWorkspace) : undefined;
      const selectedIds = Array.isArray(workspace?.selectedRecipientIds)
        ? new Set(workspace.selectedRecipientIds.filter((id): id is string => typeof id === "string"))
        : new Set<string>();
      const results = Array.isArray(workspace?.emailResults) ? workspace.emailResults : [];
      const seen = new Set<string>();
      const savedRecipients: CampaignRecipient[] = [];

      for (const result of results) {
        if (!isEmailResult(result) || result.status !== "Success") continue;
        const id = `recipient:${result.email.toLowerCase()}`;
        if (!selectedIds.has(id) || seen.has(result.email.toLowerCase())) continue;
        seen.add(result.email.toLowerCase());
        savedRecipients.push({
          email: result.email,
          school: result.schoolName,
          state: result.state ?? "-",
          district: result.district ?? "-",
          sourcePage: result.sourcePage,
        });
      }

      const tpl = TEMPLATES.find((t) => t.id === str(workspace?.templateSelection)) ?? TEMPLATES[2];

      startTransition(() => {
        setRecipients(savedRecipients);
        setTemplateId(tpl.id);
        setSubject(str(workspace?.subject, tpl.defaultSubject));
        setPreheader(str(workspace?.previewText, tpl.defaultPreheader));
        setHeadline(str(workspace?.title, "Resources for your school community"));
        setIntro(str(workspace?.intro, "Explore practical products and resources designed for schools."));
        setBody(str(workspace?.body, "We would be happy to share more information about what may be useful for your school."));
        setCtaText(str(workspace?.ctaText, "View Full Catalogue"));
        setCtaUrl(str(workspace?.ctaUrl, "/catalog"));
        setFromName(str(workspace?.fromName));
        setFromEmail(str(workspace?.fromEmail));
      });
    } catch {
      // Use defaults on error
    } finally {
      setWorkspaceLoaded(true);
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!workspaceLoaded) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const workspace = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...workspace,
          version: 1,
          templateSelection: templateId,
          subject,
          previewText: preheader,
          title: headline,
          intro,
          body,
          ctaText,
          ctaUrl,
          fromName,
          fromEmail,
        }),
      );
    } catch {
      // Non-fatal
    }
  }, [workspaceLoaded, templateId, subject, preheader, headline, intro, body, ctaText, ctaUrl, fromName, fromEmail]);

  // Live preview with debounce
  const refreshPreview = useCallback(() => {
    if (!workspaceLoaded) return;
    if (previewController.current) previewController.current.abort();
    const controller = new AbortController();
    previewController.current = controller;

    void (async () => {
      try {
        const res = await fetch("/api/email/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            templateName: templateId,
            data: {
              fromName,
              fromEmail,
              subject,
              previewText: preheader,
              title: headline,
              intro,
              body,
              buttonText: ctaText,
              buttonUrl: ctaUrl,
              catalogueUrl: "/catalog",
            },
          }),
        });
        const payload = (await res.json()) as { html?: unknown };
        if (res.ok && typeof payload.html === "string") {
          setPreviewHtml(payload.html);
        }
      } catch {
        // Keep last preview on abort/error
      }
    })();
  }, [workspaceLoaded, templateId, fromName, fromEmail, subject, preheader, headline, intro, body, ctaText, ctaUrl]);

  useEffect(() => {
    const timer = window.setTimeout(refreshPreview, 200);
    return () => window.clearTimeout(timer);
  }, [refreshPreview]);

  function applyTemplate(tpl: Template) {
    setTemplateId(tpl.id);
    setSubject(tpl.defaultSubject);
    setPreheader(tpl.defaultPreheader);
  }

  async function handleCopySubject() {
    try {
      await navigator.clipboard.writeText(subject);
      setCopySubjectStatus("Copied!");
      window.setTimeout(() => setCopySubjectStatus(""), 2500);
    } catch {
      setCopySubjectStatus("Failed to copy");
    }
  }

  async function handleCopyPreheader() {
    try {
      await navigator.clipboard.writeText(preheader);
      setCopyPreheaderStatus("Copied!");
      window.setTimeout(() => setCopyPreheaderStatus(""), 2500);
    } catch {
      setCopyPreheaderStatus("Failed to copy");
    }
  }

  async function handleCopyHtml() {
    if (!previewHtml) return;
    try {
      await navigator.clipboard.writeText(previewHtml);
      setCopyHtmlStatus("HTML copied!");
      window.setTimeout(() => setCopyHtmlStatus(""), 2500);
    } catch {
      setCopyHtmlStatus("Failed to copy");
    }
  }

  function handleDownloadHtml() {
    const params = new URLSearchParams({
      template: templateId,
      subject,
      preheader,
      headline,
      intro,
      body,
      ctaText,
      ctaUrl,
    });
    window.open(`/api/templates/download?${params.toString()}`, "_blank");
  }

  const selectedTemplate = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[2];

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto max-w-7xl px-5 py-5 lg:px-8">

        {/* Header */}
        <header className="mb-6 flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div>
            <p className="text-sm font-semibold text-[var(--navy)]">School Email Scraper</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Email Template Studio</p>
          </div>
          <Link href="/" className="text-xs font-semibold text-[var(--blue)] hover:underline">
            ← Back to workspace
          </Link>
        </header>

        {/* Page title + recipients badge */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--orange)]">Mailchimp output</p>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">Email Template Studio</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowRecipients((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[var(--navy)] shadow-sm hover:bg-[var(--canvas)]"
          >
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--navy)] text-[10px] font-bold text-white">
              {recipients.length}
            </span>
            Selected recipients
            <span className="text-[var(--muted)]">{showRecipients ? "▲" : "▼"}</span>
          </button>
        </div>

        {/* Recipients panel */}
        {showRecipients && (
          <section className="mb-5 rounded-xl border border-[var(--line)] bg-white shadow-[0_4px_16px_rgba(21,44,67,0.04)]">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Selected recipients</p>
              <h2 className="mt-0.5 text-sm font-semibold text-[var(--navy)]">
                {recipients.length} email{recipients.length !== 1 ? "s" : ""} will receive this campaign
              </h2>
            </div>
            {recipients.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                No recipients selected. Return to workspace and select email results.
              </p>
            ) : (
              <div className="max-h-[280px] overflow-auto">
                <table className="w-full min-w-[500px] text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--canvas)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    <tr>
                      {["Email", "School", "State", "District"].map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {recipients.map((r) => (
                      <tr key={r.email} className="hover:bg-[var(--canvas)]">
                        <td className="px-3 py-2 font-semibold text-[var(--blue)]">{r.email}</td>
                        <td className="max-w-[200px] px-3 py-2">
                          <span className="block truncate text-[var(--navy)]" title={r.school}>
                            {r.school}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[var(--muted)]">{r.state}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">{r.district}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Template picker */}
        <section className="mb-5 rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_4px_16px_rgba(21,44,67,0.04)]">
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--orange)]">01 / Template</p>
            <h2 className="mt-0.5 text-base font-semibold text-[var(--navy)]">Choose a message template</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {TEMPLATES.map((tpl) => (
              <article
                key={tpl.id}
                onClick={() => applyTemplate(tpl)}
                className={`cursor-pointer rounded-xl border p-4 transition ${
                  templateId === tpl.id
                    ? "border-[var(--blue)] bg-[var(--pale-blue)] ring-2 ring-blue-100"
                    : "border-[var(--line)] hover:border-[var(--blue)] hover:bg-[var(--canvas)]"
                }`}
              >
                <div
                  className="mb-3 h-16 overflow-hidden rounded-lg bg-white p-3 shadow-sm"
                  style={{ borderLeft: `4px solid ${tpl.accent}` }}
                >
                  <div className="h-2 w-2/3 rounded bg-[var(--navy)] opacity-80" />
                  <div className="mt-2 h-1.5 w-full rounded bg-[#cbd6df]" />
                  <div className="mt-1.5 h-1.5 w-4/5 rounded bg-[#cbd6df]" />
                  <div className="mt-2.5 h-2.5 w-1/3 rounded" style={{ backgroundColor: tpl.accent }} />
                </div>
                <h3 className="text-sm font-semibold text-[var(--navy)]">{tpl.name}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{tpl.description}</p>
                {templateId === tpl.id && (
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[var(--blue)]">
                    ✓ Selected
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* Main two-column layout */}
        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">

          {/* LEFT: Controls */}
          <div className="flex flex-col gap-4">
            <section className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_4px_16px_rgba(21,44,67,0.04)]">
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--orange)]">02 / Campaign details</p>
                <h2 className="mt-0.5 text-base font-semibold text-[var(--navy)]">Email content</h2>
              </div>
              <div className="space-y-3">
                <FormField label="Subject line">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Campaign subject"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Preheader text">
                  <input
                    value={preheader}
                    onChange={(e) => setPreheader(e.target.value)}
                    placeholder="Short inbox preview text"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Headline">
                  <input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="Email headline"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Introduction">
                  <textarea
                    value={intro}
                    onChange={(e) => setIntro(e.target.value)}
                    rows={2}
                    placeholder="Opening paragraph"
                    className={`${inputCls} h-auto resize-none py-2`}
                  />
                </FormField>
                <FormField label="Body copy">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={3}
                    placeholder="Main content"
                    className={`${inputCls} h-auto resize-none py-2`}
                  />
                </FormField>
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="CTA button text">
                    <input
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      placeholder="Button label"
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="CTA URL">
                    <input
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      placeholder="https://..."
                      className={inputCls}
                    />
                  </FormField>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_4px_16px_rgba(21,44,67,0.04)]">
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Branding (optional)</p>
              </div>
              <div className="space-y-3">
                <FormField label="Sender name">
                  <input
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Your organization"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Sender email (shown in footer)">
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="contact@yourdomain.com"
                    className={inputCls}
                  />
                </FormField>
              </div>
            </section>

            {/* Action buttons */}
            <section className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_4px_16px_rgba(21,44,67,0.04)]">
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--orange)]">03 / Export</p>
                <h2 className="mt-0.5 text-base font-semibold text-[var(--navy)]">Mailchimp output</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ActionButton onClick={handleCopySubject} status={copySubjectStatus} label="Copy Subject" />
                <ActionButton onClick={handleCopyPreheader} status={copyPreheaderStatus} label="Copy Preheader" />
                <ActionButton onClick={handleCopyHtml} status={copyHtmlStatus} label="Copy HTML" />
                <ActionButton onClick={handleDownloadHtml} status="" label="Download HTML" primary />
              </div>
            </section>

            {/* Mailchimp instructions */}
            <section className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_4px_16px_rgba(21,44,67,0.04)]">
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--orange)]">04 / How to use</p>
                <h2 className="mt-0.5 text-base font-semibold text-[var(--navy)]">Mailchimp instructions</h2>
              </div>
              <ol className="space-y-2 text-xs leading-5 text-[var(--muted)]">
                <li className="flex gap-2">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-[9px] font-bold text-white">
                    1
                  </span>
                  Click <strong className="text-[var(--navy)]">Download HTML</strong> to save the rendered template.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-[9px] font-bold text-white">
                    2
                  </span>
                  In Mailchimp, create a new campaign → select <strong className="text-[var(--navy)]">Code your own</strong> template.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-[9px] font-bold text-white">
                    3
                  </span>
                  Paste or upload the downloaded HTML.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-[9px] font-bold text-white">
                    4
                  </span>
                  Use <strong className="text-[var(--navy)]">Copy Subject</strong> and{" "}
                  <strong className="text-[var(--navy)]">Copy Preheader</strong> to fill in the campaign details fields.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-[9px] font-bold text-white">
                    5
                  </span>
                  Import your recipient list and send. The{" "}
                  <code className="rounded bg-[var(--canvas)] px-1 font-mono">*|UNSUB|*</code> placeholder will be
                  automatically filled by Mailchimp.
                </li>
              </ol>
            </section>
          </div>

          {/* RIGHT: Preview */}
          <div className="flex flex-col gap-4">
            <section className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_4px_16px_rgba(21,44,67,0.04)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Live preview</p>
                  <h2 className="mt-0.5 text-base font-semibold text-[var(--navy)]">
                    {selectedTemplate.name}
                  </h2>
                </div>
                <div className="flex items-center rounded-lg border border-[var(--line)] bg-[var(--canvas)] p-0.5">
                  {(["desktop", "mobile"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPreviewMode(mode)}
                      className={`rounded-md px-3 py-1.5 text-[11px] font-semibold capitalize ${
                        previewMode === mode
                          ? "bg-white text-[var(--navy)] shadow-sm"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-center overflow-auto rounded-lg bg-[#e9eef2] p-4">
                {previewHtml ? (
                  <iframe
                    title="Email preview"
                    srcDoc={previewHtml}
                    className="border-0 bg-white shadow-sm transition-all"
                    style={{
                      width: previewMode === "mobile" ? "375px" : "640px",
                      height: "600px",
                      maxWidth: "100%",
                    }}
                  />
                ) : (
                  <div className="grid h-[600px] w-full place-items-center text-sm text-[var(--muted)]">
                    Rendering preview…
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
