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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
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
 * Clean, minimal workstation layout for moderators. When unassigned,
 * presents an integrated assignment card explaining data protection rules
 * and the materials held under moderation review.
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
      {/* Header Summary */}
      <header className="dk-report-hero">
        <div className="dk-report-hero-head">
          <div>
            <h1 className="dk-report-hero-title">
              {resourceTypeLabel(detail.resourceType)} report · {detail.category}
            </h1>
            <p className="dk-report-hero-meaning">
              {reportStatusMeaning(detail.status)}
            </p>
          </div>
          <div style={{ flexShrink: 0 }}>
            <StatusBadge
              tone={reportStatusTone(detail.status)}
              label={reportStatusLabel(detail.status)}
            />
          </div>
        </div>

        {/* Key Metrics */}
        <dl className="dk-report-metrics">
          <Fact label="Report reference">
            <span className="dk-ref-code" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
              {formatReferenceId(detail.id, "RPT", detail.createdAt)}
            </span>
            <CopyButton text={detail.id} label="report reference ID" />
          </Fact>
          <Fact label="Target entity">
            <span>{resourceTypeLabel(detail.resourceType)}</span>
          </Fact>
          <Fact label="Reported by">
            <span>{detail.reporterDisplayName}</span>
          </Fact>
          <Fact label="Reported at">
            <time dateTime={detail.createdAt}>{formatDateTime(detail.createdAt)}</time>
          </Fact>
          <Fact label="Assignee">
            <span style={{ color: isAssigned ? "var(--dk-textPrimary)" : "var(--dk-textSecondary)" }}>
              {detail.assignee ?? "Unassigned"}
            </span>
          </Fact>
        </dl>
      </header>

      {/* Case Content */}
      {detail.access.restricted ? (
        <section className="dk-report-lock-card" aria-label="Access Restricted">
          <div>
            <h2 className="dk-report-lock-title">
              {detail.access.reason === "unassigned"
                ? "Case Assignment Required"
                : "Assigned to Another Moderator"}
            </h2>
            <p className="dk-report-lock-desc">
              {detail.access.reason === "unassigned"
                ? "To maintain user confidentiality and audit integrity, detailed case statements, uploaded evidence files, and moderation action controls are restricted until claimed by a moderator."
                : `This report is currently assigned to ${detail.assignee ?? "another moderator"}. Sensitive narrative details and evidence are restricted to the active assignee.`}
            </p>
          </div>

          <div className="dk-report-lock-action-bar">
            <div className="dk-report-lock-assignee">
              <span className="dk-report-lock-assignee-label">Assignee:</span>
              <span className="dk-report-lock-assignee-value">
                {detail.assignee ? detail.assignee : "Unassigned"}
              </span>
            </div>
            <div>
              <ReportActionsPanel
                reportId={detail.id}
                status={detail.status}
                assignee={detail.assignee}
                actor={actor}
              />
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
                <span className="dk-report-locked-item-head">Report Statement & Narrative</span>
                <p>Full incident description and allegation notes submitted by the reporter.</p>
              </div>
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Evidence & File Attachments</span>
                <p>Private object storage uploads, screenshots, and supporting notes.</p>
              </div>
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Reported Subject Context</span>
                <p>Direct view of the target {detail.resourceType} content and context.</p>
              </div>
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Triage History & Signal</span>
                <p>Reporter filing history, pile-on volume, and case transition log.</p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="dk-report-grid">
          {/* Main Column */}
          <div className="dk-report-main">
            {/* Reported Subject */}
            <CaseSubjectCard subject={detail.subject} />

            {/* Narrative */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Report narrative</h2>
                <span className="dk-badge dk-badge-neutral">
                  {resourceTypeLabel(detail.resourceType)}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--dk-textSecondary)" }}>
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

            {/* Evidence */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Evidence & attachments</h2>
                <span className="dk-badge dk-badge-neutral">
                  {detail.evidence.length} {detail.evidence.length === 1 ? "file" : "files"}
                </span>
              </div>
              <p className="dk-muted" style={{ marginTop: 0, marginBottom: 14, fontSize: 13 }}>
                Attachment names and notes only. Raw storage files require an authorized signed URL.
              </p>
              <EvidenceList items={detail.evidence} />
            </div>

            {/* History */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Case history</h2>
                <span className="dk-badge dk-badge-neutral">
                  {detail.history.length} {detail.history.length === 1 ? "event" : "events"}
                </span>
              </div>
              <CaseHistoryList events={detail.history} statusLabel={reportStatusLabel} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="dk-report-sidebar">
            {/* Moderation Controls */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Moderation actions</h2>
                <StatusBadge
                  tone={reportStatusTone(detail.status)}
                  label={reportStatusLabel(detail.status)}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <p style={{ margin: "0 0 4px 0", fontSize: 11, fontWeight: 600, color: "var(--dk-textSecondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Assignee
                </p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dk-textPrimary)" }}>
                  {detail.assignee ?? "Unassigned"}
                </p>
              </div>
              <ReportActionsPanel
                reportId={detail.id}
                status={detail.status}
                assignee={detail.assignee}
                actor={actor}
              />
            </div>

            {/* Triage */}
            {detail.triage ? (
              <div className="dk-report-card">
                <div className="dk-report-card-head">
                  <h2>Reporter triage</h2>
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

            {/* Case Info */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Case metadata</h2>
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




