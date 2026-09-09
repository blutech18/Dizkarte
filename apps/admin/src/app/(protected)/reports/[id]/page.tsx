import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { CaseHistoryList } from "@/components/ui/CaseHistoryList";
import { EvidenceList } from "@/components/ui/EvidenceList";
import { ReportActionsPanel } from "./ReportActionsPanel";
import { CaseSubjectCard } from "@/components/ui/CaseSubjectCard";
import {
  reportStatusLabel,
  reportStatusTone,
  reportStatusMeaning,
} from "../status";

export const metadata: Metadata = { title: "Report" };

function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function ShieldAlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ShieldCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function LockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function FileTextIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function PaperclipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function HistoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 14 14" />
    </svg>
  );
}

function BarChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function InfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function getInitials(name?: string | null): string {
  if (!name || name.trim().length === 0) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function resourceTypeLabel(resourceType: string): string {
  return resourceType.replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Report case review page.
 *
 * Provides a streamlined navigation bar, hero card with quick metrics,
 * a unified security lock with inline assignment for unassigned cases,
 * and a 2-column investigation workstation layout when assigned.
 */
export default async function ReportDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;

  return (
    <div className="dk-detail">
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Reports", href: "/reports" },
            { label: "Case review" },
          ]}
        />
        <AppLink href="/reports" className="dk-back-btn">
          <ArrowLeftIcon />
          <span>Back to reports</span>
        </AppLink>
      </nav>
      <Suspense fallback={<DetailRegionSkeleton cards={4} lines={4} />}>
        <ReportCaseRecord caseId={id} actor={session.email} />
      </Suspense>
    </div>
  );
}

async function ReportCaseRecord({
  caseId,
  actor,
}: {
  readonly caseId: string;
  readonly actor: string;
}) {
  const repository = getAdminRepository();
  const detail = await repository.getReport({ reportId: caseId, actor });

  if (!detail) {
    notFound();
  }

  const isAssigned = detail.assignee !== null;

  return (
    <>
      {/* Hero Header Card */}
      <header className="dk-report-hero">
        <div className="dk-report-hero-head">
          <div className="dk-report-hero-title-group">
            <ShieldAlertIcon
              width={34}
              height={34}
              style={{ color: "var(--dk-primary)", flexShrink: 0 }}
            />
            <div>
              <h1 className="dk-report-hero-title">
                {resourceTypeLabel(detail.resourceType)} report · {detail.category}
              </h1>
              <p className="dk-report-hero-meaning">
                {reportStatusMeaning(detail.status)}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <StatusBadge
              tone={reportStatusTone(detail.status)}
              label={reportStatusLabel(detail.status)}
            />
          </div>
        </div>

        {/* Hero Metrics Row */}
        <dl className="dk-booking-metrics">
          <Fact label="Report reference">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="dk-ref-code" style={{ fontSize: 13 }}>
                {formatReferenceId(detail.id, "RPT", detail.createdAt)}
              </span>
              <CopyButton text={detail.id} label="report reference ID" />
            </div>
          </Fact>
          <Fact label="Target entity">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontWeight: 700,
                  fontSize: 14,
                  color: "var(--dk-textPrimary)",
                }}
              >
                {resourceTypeLabel(detail.resourceType)}
              </span>
              <span className="dk-badge dk-badge-neutral" style={{ fontSize: 11, padding: "1px 6px" }}>
                {detail.category}
              </span>
            </div>
          </Fact>
          <Fact label="Reported by">
            {detail.access.restricted ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--dk-textSecondary)",
                  fontSize: 13.5,
                  fontWeight: 600,
                }}
              >
                <LockIcon width={14} height={14} />
                <span>{detail.reporterDisplayName}</span>
              </span>
            ) : (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span className="dk-metric-avatar" aria-hidden="true">
                  {getInitials(detail.reporterDisplayName)}
                </span>
                <span>{detail.reporterDisplayName}</span>
              </div>
            )}
          </Fact>
          <Fact label="Reported at">
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>
              <time dateTime={detail.createdAt}>{formatDateTime(detail.createdAt)}</time>
            </span>
          </Fact>
          <Fact label="Assignee">
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: isAssigned ? "var(--dk-textPrimary)" : "var(--dk-textSecondary)",
              }}
            >
              {detail.assignee ?? "Unassigned"}
            </span>
          </Fact>
        </dl>
      </header>

      {/* Case Content: Restricted vs Unrestricted */}
      {detail.access.restricted ? (
        <section className="dk-report-lock-card" aria-label="Access Restricted">
          <div className="dk-report-lock-banner">
            <div className="dk-report-lock-icon-wrap" aria-hidden="true">
              <LockIcon width={26} height={26} />
            </div>
            <div className="dk-report-lock-info">
              <div className="dk-report-lock-header-row">
                <h2 className="dk-report-lock-title">
                  {detail.access.reason === "unassigned"
                    ? "Case Assignment Required"
                    : "Assigned to Another Moderator"}
                </h2>
                <span className="dk-report-lock-badge">
                  {detail.access.reason === "unassigned" ? "Unassigned" : "Restricted"}
                </span>
              </div>
              <p className="dk-report-lock-desc">
                {detail.access.reason === "unassigned"
                  ? "To safeguard user confidentiality and maintain audited chain-of-custody standards, detailed user narratives, uploaded evidence attachments, and moderation actions remain locked until this case is claimed."
                  : `This report is currently assigned to ${detail.assignee ?? "another moderator"}. Sensitive narratives and evidence are restricted to the active assignee.`}
              </p>
              <div className="dk-report-lock-action-bar">
                <div className="dk-report-lock-assignee">
                  <span className="dk-report-lock-assignee-label">Current Assignee:</span>
                  <span className="dk-report-lock-assignee-value">
                    {detail.assignee ? detail.assignee : "Unassigned"}
                  </span>
                </div>
                <div className="dk-report-lock-btn-wrap">
                  <ReportActionsPanel
                    reportId={detail.id}
                    status={detail.status}
                    assignee={detail.assignee}
                    actor={actor}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="dk-report-lock-preview">
            <h3 className="dk-report-lock-preview-title">Protected Information in this Case</h3>
            <p className="dk-report-lock-preview-sub">
              {detail.access.reason === "unassigned"
                ? "Assign this case to yourself to inspect and action the following materials:"
                : "The following items are restricted to the active case assignee:"}
            </p>
            <div className="dk-report-locked-grid">
              <div className="dk-report-locked-item">
                <div className="dk-report-locked-item-head">
                  <span className="dk-report-locked-icon" aria-hidden="true">📝</span>
                  <strong>Report Statement & Reason</strong>
                </div>
                <p>Full incident description and allegation notes submitted by the reporter.</p>
              </div>
              <div className="dk-report-locked-item">
                <div className="dk-report-locked-item-head">
                  <span className="dk-report-locked-icon" aria-hidden="true">📎</span>
                  <strong>Evidence & Attachments</strong>
                </div>
                <p>Private object storage uploads, screenshots, and supporting files.</p>
              </div>
              <div className="dk-report-locked-item">
                <div className="dk-report-locked-item-head">
                  <span className="dk-report-locked-icon" aria-hidden="true">🎯</span>
                  <strong>Reported Subject Context</strong>
                </div>
                <p>Direct view of the target {detail.resourceType} content and context.</p>
              </div>
              <div className="dk-report-locked-item">
                <div className="dk-report-locked-item-head">
                  <span className="dk-report-locked-icon" aria-hidden="true">📊</span>
                  <strong>Triage History & Reporter Signal</strong>
                </div>
                <p>Reporter filing history, pile-on volume, and case transition log.</p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="dk-report-grid">
          {/* Main Investigation Column */}
          <div className="dk-report-main">
            {/* Reported Subject */}
            <CaseSubjectCard subject={detail.subject} />

            {/* Narrative & Statement */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>
                  <FileTextIcon />
                  <span>Report Narrative & Allegations</span>
                </h2>
                <span className="dk-badge dk-badge-neutral">
                  {resourceTypeLabel(detail.resourceType)}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--dk-textSecondary)" }}>
                <strong>Subject reference:</strong> {detail.caseSubject.resourceLabel}
              </p>
              {detail.narrative ? (
                <div className="dk-report-narrative-box">
                  {detail.narrative}
                </div>
              ) : (
                <p className="dk-muted" style={{ marginTop: 12 }}>
                  No additional written narrative was provided with this report.
                </p>
              )}
            </div>

            {/* Evidence & Attachments */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>
                  <PaperclipIcon />
                  <span>Evidence & Attachments</span>
                </h2>
                <span className="dk-badge dk-badge-neutral">
                  {detail.evidence.length} {detail.evidence.length === 1 ? "file" : "files"}
                </span>
              </div>
              <p className="dk-muted" style={{ marginTop: 0, marginBottom: 14 }}>
                Attachment names and notes only. Raw storage files require an authorized signed URL.
              </p>
              <EvidenceList items={detail.evidence} />
            </div>

            {/* Case History */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>
                  <HistoryIcon />
                  <span>Investigation & Decision History</span>
                </h2>
                <span className="dk-badge dk-badge-neutral">
                  {detail.history.length} {detail.history.length === 1 ? "event" : "events"}
                </span>
              </div>
              <CaseHistoryList events={detail.history} statusLabel={reportStatusLabel} />
            </div>
          </div>

          {/* Sidebar Column */}
          <div className="dk-report-sidebar">
            {/* Moderation Controls */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>
                  <ShieldCheckIcon />
                  <span>Moderation Actions</span>
                </h2>
                <StatusBadge
                  tone={reportStatusTone(detail.status)}
                  label={reportStatusLabel(detail.status)}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: "0 0 6px 0", fontSize: 12, fontWeight: 700, color: "var(--dk-textSecondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Current Assignee
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="dk-metric-avatar" aria-hidden="true">
                    {getInitials(detail.assignee ?? actor)}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--dk-textPrimary)" }}>
                    {detail.assignee ?? "Unassigned"}
                  </span>
                </div>
              </div>
              <ReportActionsPanel
                reportId={detail.id}
                status={detail.status}
                assignee={detail.assignee}
                actor={actor}
              />
            </div>

            {/* Reporter & Volume Triage */}
            {detail.triage ? (
              <div className="dk-report-card">
                <div className="dk-report-card-head">
                  <h2>
                    <BarChartIcon />
                    <span>Reporter & Volume Triage</span>
                  </h2>
                </div>
                <dl className="dk-fact-grid" style={{ margin: 0 }}>
                  <dt>Reporter</dt>
                  <dd>
                    <AppLink href={`/users/${detail.triage.reporter.id}`}>
                      {detail.triage.reporter.displayName}
                    </AppLink>{" "}
                    <span className="dk-badge dk-badge-neutral" style={{ fontSize: 11 }}>
                      {detail.triage.reporter.accountStatus}
                    </span>
                  </dd>
                  <dt>Reports filed</dt>
                  <dd>
                    {detail.triage.reporter.reportsFiled} total,{" "}
                    {detail.triage.reporter.reportsDismissed} dismissed
                  </dd>
                  <dt>Distinct reporters</dt>
                  <dd>
                    <strong>{detail.triage.distinctReporters}</strong>
                  </dd>
                  <dt>Open cases on resource</dt>
                  <dd>{detail.triage.openCases}</dd>
                  <dt>Previously actioned</dt>
                  <dd>{detail.triage.actionedCases}</dd>
                </dl>
                <p className="dk-muted" style={{ margin: "14px 0 0 0", fontSize: 12 }}>
                  Counts only. The number of distinct reporters distinguishes a single complaint from a coordinated pile-on.
                </p>
              </div>
            ) : null}

            {/* Quick Case Info */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>
                  <InfoIcon />
                  <span>Case Metadata</span>
                </h2>
              </div>
              <dl className="dk-fact-grid" style={{ margin: 0 }}>
                <dt>Case ID</dt>
                <dd>
                  <code style={{ fontSize: 11.5, wordBreak: "break-all" }}>{detail.id}</code>
                </dd>
                <dt>Category</dt>
                <dd style={{ textTransform: "capitalize" }}>{detail.category}</dd>
                <dt>Target entity</dt>
                <dd style={{ textTransform: "capitalize" }}>{detail.resourceType}</dd>
                <dt>Opened at</dt>
                <dd>{formatDateTime(detail.createdAt)}</dd>
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



