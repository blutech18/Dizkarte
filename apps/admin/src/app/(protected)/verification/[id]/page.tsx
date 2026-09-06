import { LinkButton } from "@/components/ui/Button";
import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import type { VerificationCaseDetail } from "@/lib/repository/types";
import { Breadcrumbs } from "@/components/ui/Field";
import {
  verificationDecisionsFor,
  verificationStatusLabel,
  verificationStatusTone,
} from "../status";
import { VerificationDecisionPanel } from "./VerificationDecisionPanel";
import { VerificationRecordSkeleton } from "./VerificationSkeleton";

export const metadata: Metadata = { title: "Verification case" };

function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

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

function DocumentIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h6" />
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
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function LockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
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
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function GavelIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="m14 13-7.5 7.5c-.8.8-2.2.8-3 0s-.8-2.2 0-3L11 10" />
      <path d="m16 16 6-6" />
      <path d="m8 8 6-6" />
      <path d="m9 7 8 8" />
      <path d="m21 11-8-8" />
    </svg>
  );
}

function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertCircleIcon(props: SVGProps<SVGSVGElement>) {
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
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  const first = parts[0];
  if (!first) return "U";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1];
  if (!last) return first.slice(0, 2).toUpperCase();
  const firstChar = first[0] ?? "";
  const lastChar = last[0] ?? "";
  return (firstChar + lastChar).toUpperCase();
}

function documentLabel(kind: string): string {
  return kind
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function unavailableDecisionMessage(status: string): string {
  if (status === "RESUBMISSION_REQUIRED") {
    return "The applicant must submit corrected documents before another review can proceed.";
  }
  if (status === "APPROVED") {
    return "This applicant has been verified. Marketplace features requiring KYC are unlocked.";
  }
  if (status === "REJECTED") {
    return "This verification case was rejected and closed. No further operator actions are permitted.";
  }
  return "This case already has a final decision. No further action is available.";
}

/**
 * Verification case review.
 *
 * Modern, clean, and minimalist layout presenting the applicant's credentials,
 * submitted document metadata, decision panel, and immutable audit history.
 */
export default async function VerificationDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;
  const detail = await getAdminRepository().getVerificationCase(id);
  if (!detail) notFound();

  return (
    <div className="dk-detail">
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Identity verification", href: "/verification" },
            { label: "Case review" },
          ]}
        />
        <AppLink className="dk-back-btn" href="/verification">
          <ArrowLeftIcon />
          <span>Back to verification queue</span>
        </AppLink>
        <span className="dk-booking-ref-text" title={id}>
          Case Ref: {formatReferenceId(id, "VER", detail.submittedAt)}
        </span>
      </nav>

      <Suspense fallback={<VerificationRecordSkeleton />}>
        <VerificationCaseRecord caseId={id} detailInitial={detail} />
      </Suspense>
    </div>
  );
}

async function VerificationCaseRecord({
  caseId,
  detailInitial,
}: {
  readonly caseId: string;
  readonly detailInitial?: VerificationCaseDetail | null;
}) {
  const detail = detailInitial ?? (await getAdminRepository().getVerificationCase(caseId));
  if (!detail) notFound();

  const decisions = verificationDecisionsFor(detail.status);
  const formattedCaseRef = formatReferenceId(detail.id, "VER", detail.submittedAt);
  const formattedUserRef = formatReferenceId(detail.userId, "USR");

  return (
    <>
      {/* Hero Header Card */}
      <header className="dk-booking-hero">
        <div className="dk-card-header-flex" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <div className="dk-verification-hero-avatar" aria-hidden="true">
              {initials(detail.userDisplayName)}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 className="dk-booking-hero-title" style={{ margin: 0, fontSize: "clamp(20px, 2.5vw, 26px)" }}>
                {detail.userDisplayName}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <span className="dk-task-ref-header" title={detail.userId}>
                  <span className="dk-task-ref-label">Applicant Ref: </span>
                  <span className="dk-task-ref-value">{formattedUserRef}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="dk-status-action-row">
            <div className="dk-status-action-state">
              <span
                className={`dk-status-action-dot dk-status-action-dot-${verificationStatusTone(detail.status)}`}
                aria-hidden="true"
              />
              <span className="dk-status-action-label">{verificationStatusLabel(detail.status)}</span>
            </div>
            <div className="dk-status-action-divider" aria-hidden="true" />
            <AppLink
              href={`/users/${detail.userId}`}
              className="dk-status-action-btn"
              title={`View user profile for ${detail.userDisplayName}`}
            >
              <span>View account</span>
              <ExternalLinkIcon />
            </AppLink>
          </div>
        </div>

        <dl className="dk-detail-header-meta dk-booking-metrics">
          <Fact label="Documents">
            <span className="dk-fact-amount" style={{ fontSize: 22 }}>
              {detail.documents.length}
            </span>
          </Fact>
          <Fact label="Assigned Reviewer">
            {detail.assignedAdminName ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                <span className="dk-metric-avatar" aria-hidden="true">
                  {initials(detail.assignedAdminName)}
                </span>
                <span>{detail.assignedAdminName}</span>
              </span>
            ) : (
              <span className="dk-badge dk-badge-neutral" style={{ padding: "3px 9px", fontSize: 12 }}>
                Unassigned
              </span>
            )}
          </Fact>
          <Fact label="Case Events">
            <span style={{ fontWeight: 700, fontSize: 17, color: "var(--dk-textPrimary)" }}>
              {detail.history.length}
            </span>
          </Fact>
          <Fact label="Submitted">
            <span className="dk-metric-time-badge">
              <ClockIcon />
              <time dateTime={detail.submittedAt}>{formatDateTime(detail.submittedAt)}</time>
            </span>
          </Fact>
        </dl>
      </header>

      {/* Two-Column Responsive Layout */}
      <div className="dk-booking-grid">
        {/* Left Column: Submitted Documents & Audit Trail */}
        <div className="dk-booking-col">
          {/* Section 1: Submitted Documents */}
          <section className="dk-card" aria-labelledby="documents-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DocumentIcon />
                <h2 id="documents-heading">Submitted Documents</h2>
              </div>
              <span className="dk-card-badge">
                {detail.documents.length} {detail.documents.length === 1 ? "document" : "documents"}
              </span>
            </div>

            <div className="dk-security-callout">
              <div className="dk-callout-header">
                <strong>Manual Document Review</strong>
                <ShieldCheckIcon className="dk-callout-icon" aria-hidden="true" />
              </div>
              <p>
                No automated identity decision is performed. Document metadata is authorized for
                this operator review; raw object payloads remain strictly secured.
              </p>
            </div>

            {detail.documents.length === 0 ? (
              <div className="dk-verification-empty">
                <strong>No documents on file</strong>
                <p>No document metadata is attached to this verification case.</p>
              </div>
            ) : (
              <div className="dk-verification-doc-list">
                {detail.documents.map((document, index) => (
                  <div key={`${document.kind}-${index}`} className="dk-verification-doc-item">
                    <div className="dk-verification-doc-header">
                      <div className="dk-verification-doc-badge">
                        <DocumentIcon />
                      </div>
                      <div className="dk-verification-doc-info">
                        <h3 className="dk-verification-doc-title">{documentLabel(document.kind)}</h3>
                        <span className="dk-verification-doc-kind">Kind: {document.kind}</span>
                      </div>
                      <span className="dk-verification-doc-security">
                        <LockIcon />
                        <span>Authorized</span>
                      </span>
                    </div>
                    <div className="dk-verification-doc-meta-row">
                      <span className="dk-verification-doc-meta-label">Payload status:</span>
                      <code className="dk-verification-doc-meta-value">{document.signedUrlPreview}</code>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Case History & Audit Trail */}
          <section className="dk-card" aria-labelledby="history-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ClockIcon />
                <h2 id="history-heading">Case History & Audit Trail</h2>
              </div>
              <span className="dk-card-badge">
                {detail.history.length} {detail.history.length === 1 ? "event" : "events"}
              </span>
            </div>

            {detail.history.length === 0 ? (
              <div className="dk-verification-empty">
                <strong>No case events recorded</strong>
                <p>State transitions and operator decisions are recorded in the immutable Admin audit trail.</p>
              </div>
            ) : (
              <ol className="dk-verification-timeline">
                {detail.history.map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <span className="dk-verification-timeline-marker" aria-hidden="true" />
                    <div className="dk-verification-timeline-content">
                      <div className="dk-verification-timeline-heading">
                        <div className="dk-verification-timeline-statuses">
                          <span className="dk-timeline-transition">
                            {verificationStatusLabel(event.fromStatus)} → {verificationStatusLabel(event.toStatus)}
                          </span>
                          <span className="dk-timeline-actor">by {event.actor}</span>
                        </div>
                        <time dateTime={event.at}>{formatDateTime(event.at)}</time>
                      </div>
                      {event.reason ? (
                        <blockquote className="dk-verification-timeline-reason">
                          {event.reason}
                        </blockquote>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Right Column: Decision Panel & Review Context */}
        <div className="dk-booking-col">
          {/* Section 1: Decision */}
          <section className="dk-card" aria-labelledby="decision-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <GavelIcon />
                <h2 id="decision-heading">{decisions.length > 0 ? "Make a Decision" : "Decision"}</h2>
              </div>
              <span className="dk-card-badge">
                {decisions.length > 0 ? "Action required" : "Final decision"}
              </span>
            </div>

            {decisions.length === 0 ? (
              <div className="dk-decision-resolved-box">
                <div className="dk-callout-header">
                  <strong>
                    {detail.status === "APPROVED"
                      ? "Identity Verified"
                      : detail.status === "REJECTED"
                        ? "Verification Rejected"
                        : "Resubmission Pending"}
                  </strong>
                  {detail.status === "APPROVED" ? (
                    <CheckCircleIcon className="dk-callout-icon" aria-hidden="true" />
                  ) : (
                    <AlertCircleIcon className="dk-callout-icon" aria-hidden="true" />
                  )}
                </div>
                <p>{unavailableDecisionMessage(detail.status)}</p>
              </div>
            ) : (
              <div className="dk-decision-active-box">
                <p className="dk-decision-prompt">
                  A written reason is required for any decision and will be permanently recorded in the Admin audit log.
                </p>
                <VerificationDecisionPanel caseId={detail.id} currentStatus={detail.status} />
              </div>
            )}
          </section>

          {/* Section 2: Review Context & References */}
          <section className="dk-card" aria-labelledby="context-heading">
            <div className="dk-card-header-flex">
              <h2 id="context-heading">Review Context</h2>
              <span className="dk-card-badge">KYC Level 2</span>
            </div>

            <dl className="dk-fact-grid" style={{ marginTop: 12 }}>
              <Fact label="Review Method">
                <span>Manual Operator Review</span>
              </Fact>
              <Fact label="Automated Decision">
                <span>None</span>
              </Fact>
              <Fact label="Documents Received">
                <span>{detail.documents.length}</span>
              </Fact>
              <Fact label="Assigned Reviewer">
                <span>{detail.assignedAdminName ?? "Unassigned"}</span>
              </Fact>
            </dl>

            <div className="dk-card-divider" />

            <div className="dk-ref-group">
              <div className="dk-ref-row">
                <span className="dk-ref-title">Case Reference</span>
                <span className="dk-ref-code" title={detail.id}>{formattedCaseRef}</span>
              </div>
              <div className="dk-ref-row">
                <span className="dk-ref-title">Applicant Reference</span>
                <span className="dk-ref-code" title={detail.userId}>{formattedUserRef}</span>
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <LinkButton
                href={`/users/${detail.userId}`}
                variant="secondary"
              >
                <span>View user account</span>
                <ExternalLinkIcon />
              </LinkButton>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
