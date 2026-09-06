import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { Breadcrumbs } from "@/components/ui/Field";
import { AppLink } from "@/components/ui/AppLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UserRowActions } from "../UserRowActions";
import { userStatusLabel, userStatusMeaning, userStatusTone } from "../status";
import { verificationStatusLabel, verificationStatusTone } from "../../verification/status";
import { taskerApplicationStatusLabel, taskerApplicationStatusTone } from "../../taskers/status";
import { UserRecordSkeleton } from "./UserSkeleton";

export const metadata: Metadata = { title: "User profile" };

function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function formatLanguage(code: string): string {
  switch (code.toLowerCase()) {
    case "en":
      return "English";
    case "tl":
    case "fil":
      return "Filipino / Tagalog";
    case "ceb":
      return "Cebuano";
    case "ilo":
      return "Ilocano";
    default:
      return code.toUpperCase();
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return (parts[0]?.[0] ?? "U").toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return `${first}${last}`.toUpperCase();
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

export default async function UserDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;

  return (
    <div className="dk-detail">
      <Suspense fallback={<UserRecordSkeleton />}>
        <UserRecord userId={id} />
      </Suspense>
    </div>
  );
}

async function UserRecord({ userId }: { readonly userId: string }) {
  const repository = getAdminRepository();
  const user = await repository.getUser(userId);
  if (!user) notFound();

  const formattedUserRef = formatReferenceId(user.id, "USR");
  const activeCapabilities = user.capabilities.filter((grant) => grant.revokedAt === null);

  return (
    <>
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Users", href: "/users" },
            { label: "User profile" },
          ]}
        />
        <AppLink className="dk-back-btn" href="/users">
          <ArrowLeftIcon />
          <span>Back to users</span>
        </AppLink>
        <span className="dk-booking-ref-text" title={user.id}>
          User Ref: {formattedUserRef}
        </span>
      </nav>

      {/* Hero Header Card */}
      <header className="dk-booking-hero">
        <div className="dk-card-header-flex" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <div className="dk-verification-hero-avatar" aria-hidden="true">
              {initials(user.displayName)}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 className="dk-booking-hero-title" style={{ margin: 0, fontSize: "clamp(20px, 2.5vw, 26px)" }}>
                {user.displayName}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                <span className="dk-task-ref-chip" title={user.id}>
                  <span className="dk-task-ref-label">User Ref: </span>
                  <span className="dk-task-ref-value">{formattedUserRef}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="dk-status-action-row">
            <div className="dk-status-action-state">
              <span
                className={`dk-status-action-dot dk-status-action-dot-${userStatusTone(user.accountStatus)}`}
                aria-hidden="true"
              />
              <span className="dk-status-action-label">{userStatusLabel(user.accountStatus)}</span>
            </div>
          </div>
        </div>

        <p className="dk-detail-header-meaning" style={{ margin: "0 0 16px 0" }}>
          {userStatusMeaning(user.accountStatus)}
        </p>

        <dl className="dk-detail-header-meta dk-booking-metrics">
          <Fact label="Tasks Posted">
            <span className="dk-fact-amount" style={{ fontSize: 22 }}>
              {user.taskCount}
            </span>
          </Fact>
          <Fact label="Client Bookings">
            <span className="dk-fact-amount" style={{ fontSize: 22 }}>
              {user.bookingCountAsClient}
            </span>
          </Fact>
          <Fact label="Tasker Bookings">
            <span className="dk-fact-amount" style={{ fontSize: 22 }}>
              {user.bookingCountAsTasker}
            </span>
          </Fact>
          <Fact label="Member Since">
            <span className="dk-metric-time-badge">
              <ClockIcon />
              <time dateTime={user.createdAt}>{formatDateTime(user.createdAt)}</time>
            </span>
          </Fact>
        </dl>
      </header>

      {/* Two-Column Responsive Layout */}
      <div className="dk-booking-grid">
        {/* Left Column: Marketplace Activity, Capability History, Moderation History */}
        <div className="dk-booking-col">
          {/* Card 1: Marketplace Activity */}
          <section className="dk-card" aria-labelledby="activity-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DocumentIcon />
                <h2 id="activity-heading">Marketplace Activity</h2>
              </div>
            </div>

            <dl className="dk-fact-grid" style={{ marginTop: 12 }}>
              <Fact label="Tasks Posted">
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--dk-textPrimary)" }}>
                  {user.taskCount}
                </span>
              </Fact>
              <Fact label="Bookings as Client">
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--dk-textPrimary)" }}>
                  {user.bookingCountAsClient}
                </span>
              </Fact>
              <Fact label="Bookings as Tasker">
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--dk-textPrimary)" }}>
                  {user.bookingCountAsTasker}
                </span>
              </Fact>
              <Fact label="Preferred Language">
                <span>{formatLanguage(user.language)}</span>
              </Fact>
              <Fact label="City Code">
                <span>{user.cityCode ?? "Not set"}</span>
              </Fact>
              <Fact label="Account Created">
                <time dateTime={user.createdAt}>{formatDateTime(user.createdAt)}</time>
              </Fact>
            </dl>
          </section>

          {/* Card 2: Capability History */}
          <section className="dk-card" aria-labelledby="capabilities-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheckIcon />
                <h2 id="capabilities-heading">Capability History</h2>
              </div>
            </div>

            {user.capabilities.length === 0 ? (
              <div className="dk-verification-empty">
                <strong>No capability grants on file</strong>
                <p>No roles or capabilities are recorded for this user profile.</p>
              </div>
            ) : (
              <ul className="dk-history" style={{ marginTop: 12 }}>
                {user.capabilities.map((grant) => (
                  <li key={`${grant.capability}-${grant.grantedAt}`}>
                    <div className="dk-history-head">
                      <strong>{grant.capability}</strong>
                      <StatusBadge
                        tone={grant.revokedAt ? "neutral" : "success"}
                        label={grant.revokedAt ? "Revoked" : "Active"}
                      />
                    </div>
                    <p className="dk-history-meta">
                      Granted{" "}
                      <time dateTime={grant.grantedAt}>{formatDateTime(grant.grantedAt)}</time>
                      {grant.revokedAt ? (
                        <>
                          {" · revoked "}
                          <time dateTime={grant.revokedAt}>{formatDateTime(grant.revokedAt)}</time>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Card 3: Moderation History & Audit Trail */}
          <section className="dk-card" aria-labelledby="moderation-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ClockIcon />
                <h2 id="moderation-heading">Moderation History & Audit Trail</h2>
              </div>
            </div>

            {user.moderationHistory.length === 0 ? (
              <div className="dk-verification-empty">
                <strong>No moderation actions recorded</strong>
                <p>This account is in good standing with no administrative disciplinary actions.</p>
              </div>
            ) : (
              <ol className="dk-verification-timeline" style={{ marginTop: 16 }}>
                {user.moderationHistory.map((entry) => (
                  <li key={entry.id} className="dk-verification-timeline-item">
                    <span className="dk-verification-timeline-marker" aria-hidden="true" />
                    <div className="dk-verification-timeline-content">
                      <div className="dk-verification-timeline-heading">
                        <div className="dk-verification-timeline-statuses">
                          <span className="dk-timeline-transition">{entry.action}</span>
                          <span className="dk-timeline-actor">by {entry.actor}</span>
                        </div>
                        <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                      </div>
                      {entry.capability ? (
                        <p className="dk-history-meta" style={{ marginTop: 4 }}>
                          Capability: <strong>{entry.capability}</strong>
                        </p>
                      ) : null}
                      <blockquote className="dk-verification-timeline-reason">
                        {entry.reason}
                      </blockquote>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Right Column: Account Actions, Standing & Security, References */}
        <div className="dk-booking-col">
          {/* Card 1: Account Actions */}
          <section className="dk-card" aria-labelledby="actions-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <GavelIcon />
                <h2 id="actions-heading">Account Actions</h2>
              </div>
            </div>

            <div className="dk-decision-active-box" style={{ marginTop: 12 }}>
              <p className="dk-decision-prompt">
                Every action requires an explicit reason and is permanently recorded in the Admin audit log. Capability grants are preserved so reinstatement is lossless.
              </p>
              <UserRowActions userId={user.id} status={user.accountStatus} className="dk-decision-btn-row" />
            </div>
          </section>

          {/* Card 2: Standing & Trust */}
          <section className="dk-card" aria-labelledby="standing-heading">
            <div className="dk-card-header-flex">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheckIcon />
                <h2 id="standing-heading">Standing & Trust</h2>
              </div>
            </div>

            <dl className="dk-fact-grid" style={{ marginTop: 12 }}>
              <Fact label="Identity Verification">
                {user.verificationStatus ? (
                  <div className="dk-status-action-row" style={{ height: 30 }}>
                    <div className="dk-status-action-state" style={{ padding: "0 10px" }}>
                      <span
                        className={`dk-status-action-dot dk-status-action-dot-${verificationStatusTone(user.verificationStatus)}`}
                        aria-hidden="true"
                      />
                      <span className="dk-status-action-label" style={{ fontSize: 12 }}>
                        {verificationStatusLabel(user.verificationStatus)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="dk-muted">No case submitted</span>
                )}
              </Fact>
              <Fact label="Tasker Application">
                {user.taskerApplicationStatus ? (
                  <div className="dk-status-action-row" style={{ height: 30 }}>
                    <div className="dk-status-action-state" style={{ padding: "0 10px" }}>
                      <span
                        className={`dk-status-action-dot dk-status-action-dot-${taskerApplicationStatusTone(user.taskerApplicationStatus)}`}
                        aria-hidden="true"
                      />
                      <span className="dk-status-action-label" style={{ fontSize: 12 }}>
                        {taskerApplicationStatusLabel(user.taskerApplicationStatus)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="dk-muted">Never applied</span>
                )}
              </Fact>
              <Fact label="Active Capabilities">
                {activeCapabilities.length === 0 ? (
                  <span className="dk-muted">None granted</span>
                ) : (
                  <span style={{ fontWeight: 600, color: "var(--dk-textPrimary)" }}>
                    {activeCapabilities.map((grant) => grant.capability).join(", ")}
                  </span>
                )}
              </Fact>
            </dl>

            <div className="dk-security-callout" style={{ marginTop: 16 }}>
              <div className="dk-callout-header">
                <strong>Auth Identity & Privacy</strong>
                <LockIcon className="dk-callout-icon" aria-hidden="true" />
              </div>
              <p>
                Email addresses and authentication credentials reside securely in Supabase Auth and are not readable by the operator console.
              </p>
            </div>
          </section>

          {/* Card 3: Account References */}
          <section className="dk-card" aria-labelledby="references-heading">
            <div className="dk-card-header-flex">
              <h2 id="references-heading">Account References</h2>
            </div>

            <div className="dk-ref-group" style={{ marginTop: 12 }}>
              <div className="dk-ref-row">
                <span className="dk-ref-title">User Reference</span>
                <span className="dk-ref-code" title={user.id}>{formattedUserRef}</span>
              </div>
              <div className="dk-ref-row">
                <span className="dk-ref-title">User ID</span>
                <span className="dk-ref-code" title={user.id}>{user.id}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
