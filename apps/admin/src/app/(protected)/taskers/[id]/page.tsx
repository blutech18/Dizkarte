import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime, formatElapsed } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import type { TaskerApplicationDetail } from "@/lib/repository/types";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  isAwaitingAdminDecision,
  taskerApplicationStatusLabel,
  taskerApplicationStatusMeaning,
  taskerApplicationStatusTone,
  taskerDecisionsFor,
} from "../status";
import { TaskerDecisionPanel } from "./TaskerDecisionPanel";
import { TaskerRecordSkeleton } from "./TaskerSkeleton";

export const metadata: Metadata = { title: "Tasker application" };

function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return (parts[0]?.[0] ?? "U").toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return `${first}${last}`.toUpperCase();
}

function unavailableDecisionTitle(status: string): string {
  switch (status) {
    case "APPROVED":
      return "Application Approved";
    case "REJECTED":
      return "Application Rejected";
    case "RESUBMISSION_REQUIRED":
      return "Changes Requested";
    case "SUSPENDED":
      return "Tasker Suspended";
    default:
      return "Review Complete";
  }
}

function unavailableDecisionMessage(status: string): string {
  switch (status) {
    case "APPROVED":
      return "This Tasker has been approved and can submit offers and accept paid bookings.";
    case "REJECTED":
      return "This application was rejected and is closed. The applicant can submit a new application later.";
    case "RESUBMISSION_REQUIRED":
      return "The applicant was asked to correct their application. Waiting on the applicant to resubmit.";
    case "SUSPENDED":
      return "Tasker access has been temporarily suspended.";
    default:
      return "There is no open decision available for this application.";
  }
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

function UserIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BriefcaseIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
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

function CreditCardIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

function LockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
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

export default async function TaskerApplicationDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;
  const detail = await getAdminRepository().getTaskerApplication(id);
  if (!detail) notFound();

  const formattedAppRef = formatReferenceId(detail.id, "TAP", detail.submittedAt);

  return (
    <div className="dk-detail">
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Tasker applications", href: "/taskers" },
            { label: "Application review" },
          ]}
        />
        <AppLink className="dk-back-btn" href="/taskers">
          <ArrowLeftIcon />
          <span>Back to applications</span>
        </AppLink>
        <span className="dk-booking-ref-text" title={detail.id}>
          Application Ref: {formattedAppRef}
        </span>
      </nav>

      <Suspense fallback={<TaskerRecordSkeleton />}>
        <TaskerApplicationRecord applicationId={id} detailInitial={detail} />
      </Suspense>
    </div>
  );
}

async function TaskerApplicationRecord({
  applicationId,
  detailInitial,
}: {
  readonly applicationId: string;
  readonly detailInitial?: TaskerApplicationDetail | null;
}) {
  const repository = getAdminRepository();
  const detail = detailInitial ?? (await repository.getTaskerApplication(applicationId));
  if (!detail) notFound();

  const decisions = taskerDecisionsFor(detail.status);
  const waiting = isAwaitingAdminDecision(detail.status);

  const formattedAppRef = formatReferenceId(detail.id, "TAP", detail.submittedAt);
  const formattedUserRef = formatReferenceId(detail.userId ?? detail.id, "USR");

  const completeness: ReadonlyArray<{ label: string; provided: boolean; detail: string }> = [
    {
      label: "Bio",
      provided: detail.bio.trim().length > 0,
      detail: detail.bio.trim().length > 0 ? "Statement provided" : "No statement provided",
    },
    {
      label: "Experience",
      provided: detail.experience.trim().length > 0,
      detail:
        detail.experience.trim().length > 0 ? "Experience provided" : "No experience provided",
    },
    {
      label: "Specialties",
      provided: detail.specialties.length > 0,
      detail: `${detail.specialties.length} listed`,
    },
    {
      label: "Service areas",
      provided: detail.serviceAreas.length > 0,
      detail: `${detail.serviceAreas.length} listed`,
    },
    {
      label: "Portfolio",
      provided: detail.portfolioCount > 0,
      detail: `${detail.portfolioCount} item${detail.portfolioCount === 1 ? "" : "s"} attached`,
    },
  ];

  const providedCount = completeness.filter((c) => c.provided).length;

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
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                <span className="dk-task-ref-chip" title={detail.userId ?? detail.id}>
                  <span className="dk-task-ref-label">Applicant Ref: </span>
                  <span className="dk-task-ref-value">{formattedUserRef}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="dk-status-action-row">
            <div className="dk-status-action-state">
              <span
                className={`dk-status-action-dot dk-status-action-dot-${taskerApplicationStatusTone(detail.status)}`}
                aria-hidden="true"
              />
              <span className="dk-status-action-label">{taskerApplicationStatusLabel(detail.status)}</span>
            </div>
            {detail.userId ? (
              <>
                <div className="dk-status-action-divider" aria-hidden="true" />
                <AppLink
                  href={`/users/${detail.userId}`}
                  className="dk-status-action-btn"
                  title={`View user profile for ${detail.userDisplayName}`}
                >
                  <span>View account</span>
                  <ExternalLinkIcon />
                </AppLink>
              </>
            ) : null}
          </div>
        </div>

        <p className="dk-detail-header-meaning" style={{ margin: "0 0 16px 0" }}>
          {taskerApplicationStatusMeaning(detail.status)}
        </p>

        <dl className="dk-detail-header-meta dk-booking-metrics">
          <Fact label="Submitted">
            <span className="dk-metric-time-badge">
              <ClockIcon />
              <time dateTime={detail.submittedAt}>{formatDateTime(detail.submittedAt)}</time>
            </span>
          </Fact>
          <Fact label="Review Status">
            {waiting ? (
              <span style={{ color: "var(--dk-warning)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ClockIcon />
                <span>Waiting ({formatElapsed(detail.submittedAt)})</span>
              </span>
            ) : (
              <span style={{ fontWeight: 700, color: "var(--dk-textPrimary)" }}>
                Decided
              </span>
            )}
          </Fact>
          <Fact label="Portfolio Evidence">
            <span className="dk-fact-amount" style={{ fontSize: 22 }}>
              {detail.portfolioCount}
            </span>
          </Fact>
          <Fact label="Completeness">
            <span style={{ fontWeight: 700, fontSize: 17, color: "var(--dk-textPrimary)" }}>
              {providedCount} of {completeness.length} provided
            </span>
          </Fact>
        </dl>
      </header>

      {/* Two-Column Responsive Layout */}
      <div className="dk-booking-grid">
        {/* Left Column: Applicant Profile, Services & Completeness */}
        <div className="dk-booking-col">
          {/* Card 1: About the Applicant */}
          <section className="dk-card" aria-labelledby="applicant-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <UserIcon />
                <h2 id="applicant-heading">About the Applicant</h2>
              </div>
            </div>
            <dl className="dk-fact-grid" style={{ marginTop: 16 }}>
              <div className="dk-fact">
                <dt>Bio Statement</dt>
                <dd>
                  {detail.bio.trim().length > 0 ? (
                    <blockquote className="dk-quote" style={{ margin: 0 }}>
                      {detail.bio}
                    </blockquote>
                  ) : (
                    <span className="dk-muted">Not provided</span>
                  )}
                </dd>
              </div>
              <div className="dk-fact">
                <dt>Professional Experience</dt>
                <dd>
                  {detail.experience.trim().length > 0 ? (
                    <blockquote className="dk-quote" style={{ margin: 0 }}>
                      {detail.experience}
                    </blockquote>
                  ) : (
                    <span className="dk-muted">Not provided</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {/* Card 2: Services & Coverage */}
          <section className="dk-card" aria-labelledby="services-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BriefcaseIcon />
                <h2 id="services-heading">Services & Coverage</h2>
              </div>
              <span className="dk-card-badge">
                {detail.specialties.length} {detail.specialties.length === 1 ? "specialty" : "specialties"}
              </span>
            </div>
            <dl className="dk-fact-grid" style={{ marginTop: 16 }}>
              <div className="dk-fact">
                <dt>Specialties</dt>
                <dd>
                  {detail.specialties.length === 0 ? (
                    <span className="dk-muted">No specialties listed</span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {detail.specialties.map((specialty) => (
                        <span key={specialty} className="dk-code-pill">
                          {specialty}
                        </span>
                      ))}
                    </div>
                  )}
                </dd>
              </div>
              <div className="dk-fact">
                <dt>Service Areas</dt>
                <dd>
                  {detail.serviceAreas.length === 0 ? (
                    <span className="dk-muted">No service areas listed</span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {detail.serviceAreas.map((area) => (
                        <span key={area} className="dk-code-pill">
                          {area}
                        </span>
                      ))}
                    </div>
                  )}
                </dd>
              </div>
              <Fact label="Portfolio Evidence">
                {detail.portfolioCount === 0 ? (
                  <span className="dk-muted">No items attached</span>
                ) : (
                  `${detail.portfolioCount} item${detail.portfolioCount === 1 ? "" : "s"} attached`
                )}
              </Fact>
            </dl>
          </section>

          {/* Card 3: Application Completeness */}
          <section className="dk-card" aria-labelledby="completeness-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircleIcon />
                <h2 id="completeness-heading">Application Completeness</h2>
              </div>
              <span className="dk-card-badge">
                {providedCount} of {completeness.length} provided
              </span>
            </div>
            <p className="dk-card-note" style={{ margin: "0 0 14px 0" }}>
              Context for operator review, not an automated approval score.
            </p>
            <dl className="dk-fact-grid">
              {completeness.map((item) => (
                <Fact key={item.label} label={item.label}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <StatusBadge
                      tone={item.provided ? "success" : "neutral"}
                      label={item.provided ? "Provided" : "Missing"}
                    />
                    <span className="dk-fact-aside">{item.detail}</span>
                  </div>
                </Fact>
              ))}
            </dl>
          </section>
        </div>

        {/* Right Column: Decisions, Payout Method & References */}
        <div className="dk-booking-col">
          {/* Card 1: Make a Decision */}
          <section className="dk-card" aria-labelledby="decision-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <GavelIcon />
                <h2 id="decision-heading">
                  {decisions.length > 0 ? "Make a Decision" : "Review Complete"}
                </h2>
              </div>
              <span className="dk-card-badge">
                {decisions.length > 0 ? "Action required" : "Final decision"}
              </span>
            </div>

            {decisions.length === 0 ? (
              <div className="dk-decision-resolved-box">
                <div className="dk-callout-header">
                  <strong>{unavailableDecisionTitle(detail.status)}</strong>
                  <ShieldCheckIcon className="dk-callout-icon" aria-hidden="true" />
                </div>
                <p>{unavailableDecisionMessage(detail.status)}</p>
              </div>
            ) : (
              <>
                <p className="dk-card-note" style={{ margin: "0 0 14px 0" }}>
                  A written reason is required and recorded against your Admin account in the audit trail.
                </p>
                <TaskerDecisionPanel applicationId={detail.id} currentStatus={detail.status} />
              </>
            )}
          </section>

          {/* Card 2: Payout Method */}
          <section className="dk-card" aria-labelledby="payout-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CreditCardIcon />
                <h2 id="payout-heading">Payout Method</h2>
              </div>
              <span className="dk-card-badge">Masked</span>
            </div>
            <dl className="dk-fact-grid" style={{ marginTop: 12 }}>
              <Fact label="Provider Token">
                <code>{detail.payoutTokenBoundaryLabel}</code>
              </Fact>
            </dl>
            <div className="dk-security-callout" style={{ marginTop: 14 }}>
              <div className="dk-callout-header">
                <strong>Financial Privacy Boundary</strong>
                <LockIcon className="dk-callout-icon" aria-hidden="true" />
              </div>
              <p>
                Only the provider token reference is stored. Raw card and wallet credentials are never
                exposed to this console or stored unencrypted.
              </p>
            </div>
          </section>

          {/* Card 3: Application References */}
          <section className="dk-card" aria-labelledby="references-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DocumentIcon />
                <h2 id="references-heading">Application References</h2>
              </div>
            </div>
            <dl className="dk-fact-grid" style={{ marginTop: 12 }}>
              <Fact label="Application Reference">
                <code>{formattedAppRef}</code>
              </Fact>
              <Fact label="Application ID">
                <code>{detail.id}</code>
              </Fact>
              <Fact label="Applicant Reference">
                <code>{formattedUserRef}</code>
              </Fact>
              <Fact label="User ID">
                <code>{detail.userId ?? "Not linked"}</code>
              </Fact>
              <Fact label="Submitted">
                <time dateTime={detail.submittedAt}>{formatDateTime(detail.submittedAt)}</time>
              </Fact>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
