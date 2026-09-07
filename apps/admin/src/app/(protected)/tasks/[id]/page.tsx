import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mediaStatusLabel, mediaStatusTone } from "../../media/status";
import { taskStatusLabel, taskStatusMeaning, taskStatusTone } from "../status";
import { TaskRowActions } from "../TaskRowActions";
import { TaskRecordSkeleton } from "./TaskSkeleton";

export const metadata: Metadata = { title: "Task" };

function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
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
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
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

function CalendarIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function MapPinIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function TagIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function ShieldIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ImageIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function VideoIcon(props: SVGProps<SVGSVGElement>) {
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
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function GlobeIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function FileTextIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  return `${(parts[0] ?? "")[0] ?? ""}${(parts[parts.length - 1] ?? "")[0] ?? ""}`.toUpperCase();
}

function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Task detail page.
 *
 * Modern, high-hierarchy layout presenting task requirements, schedule & location,
 * attached media, moderation history, and direct discovery oversight.
 */
export default async function TaskDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT", "ADMIN_SUPER"]);
  const { id } = await params;

  return (
    <div className="dk-detail">
      <Suspense fallback={<TaskRecordSkeleton />}>
        <TaskRecord taskId={id} />
      </Suspense>
    </div>
  );
}

async function TaskRecord({ taskId }: { readonly taskId: string }) {
  const task = await getAdminRepository().getTask(taskId);
  if (!task) notFound();

  const formattedRef = task.referenceId ?? formatReferenceId(task.id, "TSK", task.createdAt);

  return (
    <>
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Tasks", href: "/tasks" },
            { label: "Task" },
          ]}
        />
        <AppLink href="/tasks" className="dk-back-btn">
          <ArrowLeftIcon />
          <span>Back to tasks</span>
        </AppLink>
        <span className="dk-booking-ref-text" title={task.id}>
          Task Ref: {formattedRef}
        </span>
      </nav>

      {/* Hero Header Card */}
      <header className="dk-task-hero">
        <div className="dk-card-header-flex" style={{ marginBottom: 14 }}>
          <h1 className="dk-task-hero-title">{task.title}</h1>
          <div className="dk-status-action-row">
            <div className="dk-status-action-state">
              <span
                className={`dk-status-action-dot dk-status-action-dot-${taskStatusTone(task.status)}`}
                aria-hidden="true"
              />
              <span className="dk-status-action-label">{taskStatusLabel(task.status)}</span>
            </div>
            {task.bookingId ? (
              <>
                <div className="dk-status-action-divider" aria-hidden="true" />
                <AppLink
                  href={`/bookings/${task.bookingId}`}
                  className="dk-status-action-btn"
                  title="Open booking"
                >
                  <span>Open booking</span>
                  <ExternalLinkIcon />
                </AppLink>
              </>
            ) : null}
          </div>
        </div>

        <div className="dk-task-status-lead">
          <p className="dk-detail-header-meaning" style={{ margin: 0 }}>
            {taskStatusMeaning(task.status)}
          </p>
        </div>

        <dl className="dk-detail-header-meta dk-task-metrics">
          <Fact label="Task Ref">
            <span title={task.id} style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>
              {formattedRef}
            </span>
          </Fact>
          <Fact label="Budget">
            <span className="dk-fact-amount">{formatPhp(task.budgetCentavos)}</span>
            {task.currency === "PHP" ? null : ` ${task.currency}`}
          </Fact>
          <Fact label="Posted by">
            <span className="dk-metric-avatar" aria-hidden="true">
              {getInitials(task.clientDisplayName)}
            </span>
            <span>{task.clientDisplayName}</span>
          </Fact>
          <Fact label="Category">
            <span className="dk-category-badge">
              <TagIcon />
              <span>{task.categorySlug || "Uncategorised"}</span>
            </span>
          </Fact>
          <Fact label="Abuse reports">
            <span className={`dk-report-status-badge ${task.flagged ? "dk-report-flagged" : "dk-report-clean"}`}>
              <ShieldIcon />
              <span>{task.flagged ? "Open report on this task" : "None open"}</span>
            </span>
          </Fact>
        </dl>
      </header>

      {/* Two-Column Responsive Content Grid */}
      <div className="dk-task-content-grid">
        {/* Main Column */}
        <div className="dk-task-main-col">
          {/* What was requested */}
          <section className="dk-card dk-task-card" aria-labelledby="request-heading">
            <div className="dk-card-header-flex">
              <h2 id="request-heading">
                <FileTextIcon />
                <span>What was requested</span>
              </h2>
            </div>

            {/* Client-authored copy, quoted rather than restyled as console prose. */}
            <p className="dk-quote dk-task-quote">{task.description}</p>

            <div className="dk-task-highlight-box">
              <div className="dk-task-highlight-item">
                <span className="dk-task-highlight-label">
                  <CalendarIcon />
                  <span>Scheduled for</span>
                </span>
                <span className="dk-task-highlight-value">
                  {task.sameDay ? (
                    "Same day"
                  ) : task.scheduledFor ? (
                    <time dateTime={task.scheduledFor}>{formatDateTime(task.scheduledFor)}</time>
                  ) : (
                    <span className="dk-muted">No date set</span>
                  )}
                </span>
              </div>

              <div className="dk-task-highlight-item">
                <span className="dk-task-highlight-label">
                  <MapPinIcon />
                  <span>Locality</span>
                </span>
                <span className="dk-task-highlight-value">
                  {task.cityCode ? (
                    <>
                      {task.cityCode}
                      {task.barangayCode ? ` · ${task.barangayCode}` : ""}
                      {task.landmark ? ` · ${task.landmark}` : ""}
                    </>
                  ) : (
                    <span className="dk-muted">Not recorded</span>
                  )}
                </span>
              </div>
            </div>

            <dl className="dk-fact-grid">
              <Fact label="Posted">
                <time dateTime={task.createdAt}>{formatDateTime(task.createdAt)}</time>
              </Fact>
              <Fact label="Published">
                {task.publishedAt ? (
                  <time dateTime={task.publishedAt}>{formatDateTime(task.publishedAt)}</time>
                ) : (
                  <span className="dk-muted">Never published</span>
                )}
              </Fact>
              <Fact label="Last change">
                <time dateTime={task.updatedAt}>{formatDateTime(task.updatedAt)}</time>
              </Fact>
              <Fact label="Booking">
                {task.bookingId ? (
                  <AppLink
                    href={`/bookings/${task.bookingId}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    <span>Open booking</span>
                    <ExternalLinkIcon />
                  </AppLink>
                ) : (
                  <span className="dk-muted">Not booked</span>
                )}
              </Fact>
            </dl>
            <p className="dk-card-note">
              The locality is the approximate public area, not the exact address.
            </p>
          </section>

          {/* Attachments */}
          <section className="dk-card dk-task-card" aria-labelledby="attachments-heading">
            <div className="dk-card-header-flex">
              <h2 id="attachments-heading">
                <ImageIcon />
                <span>Attachments</span>
              </h2>
              <span className="dk-card-badge">
                {task.attachments.length} {task.attachments.length === 1 ? "item" : "items"}
              </span>
            </div>
            {task.attachments.length === 0 ? (
              <p className="dk-muted">No photo or clip is attached to this task.</p>
            ) : (
              <>
                <ul className="dk-attachment-gallery">
                  {task.attachments.map((attachment) => (
                    <li key={attachment.id} className="dk-attachment-card">
                      <div className="dk-attachment-top">
                        <span className="dk-attachment-kind">
                          {attachment.kind === "video" ? (
                            <>
                              <VideoIcon />
                              <span>Video clip</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon />
                              <span>Photo</span>
                            </>
                          )}
                        </span>
                        <span className="dk-attachment-id">
                          {formatReferenceId(attachment.id, "MED")}
                        </span>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        <StatusBadge
                          tone={mediaStatusTone(attachment.moderationStatus)}
                          label={mediaStatusLabel(attachment.moderationStatus)}
                        />
                      </div>
                      <div className="dk-attachment-footer">
                        <span>Uploaded</span>
                        <time dateTime={attachment.createdAt}>
                          {formatDate(attachment.createdAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="dk-media-queue-banner">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ImageIcon width={16} height={16} style={{ color: "var(--dk-primary)" }} />
                    <span style={{ fontSize: 13, fontWeight: 550, color: "var(--dk-textPrimary)" }}>
                      Full-resolution inspection & moderation
                    </span>
                  </div>
                  <AppLink
                    href={`/media?status=all&q=${encodeURIComponent(task.title)}`}
                    className="dk-back-btn"
                    style={{ fontSize: 12, padding: "5px 12px" }}
                  >
                    <span>Review these attachments in the media queue</span>
                    <ExternalLinkIcon />
                  </AppLink>
                </div>
              </>
            )}
          </section>

          {/* Admin decisions */}
          <section className="dk-card dk-task-card" aria-labelledby="decisions-heading">
            <div className="dk-card-header-flex">
              <h2 id="decisions-heading">
                <ShieldIcon />
                <span>Admin decisions</span>
              </h2>
              <span className="dk-card-badge">
                {task.moderationHistory.length} {task.moderationHistory.length === 1 ? "record" : "records"}
              </span>
            </div>
            {task.moderationHistory.length === 0 ? (
              <p className="dk-muted">No Admin decision has been recorded against this task.</p>
            ) : (
              <ol className="dk-history">
                {task.moderationHistory.map((entry) => (
                  <li key={entry.id}>
                    <div className="dk-history-head">
                      <strong>{entry.action}</strong>
                      <time className="dk-history-time" dateTime={entry.at}>
                        {formatDateTime(entry.at)}
                      </time>
                    </div>
                    <p className="dk-history-meta">{entry.actor}</p>
                    {entry.reason ? <p className="dk-quote">{entry.reason}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Sidebar Column */}
        <aside className="dk-task-side-col">
          {/* Discovery Card */}
          <section className="dk-card dk-task-card" aria-labelledby="actions-heading">
            <div className="dk-card-header-flex" style={{ marginBottom: 12 }}>
              <h2 id="actions-heading">
                <GlobeIcon />
                <span>Discovery</span>
              </h2>
              <StatusBadge
                tone={task.status === "REMOVED" ? "error" : "success"}
                label={task.status === "REMOVED" ? "Excluded" : "Eligible"}
              />
            </div>
            <p className="dk-discovery-text">
              {task.status === "REMOVED"
                ? "This task is excluded from public discovery."
                : "This task can appear in public search and the task feed."}
            </p>
            <div className="dk-discovery-action-footer">
              <TaskRowActions
                taskId={task.id}
                status={task.status}
                triggerLabel={task.status === "REMOVED" ? "Restore to discovery" : "Remove from discovery"}
                triggerClassName="dk-discovery-btn"
                className="dk-discovery-actions"
              />
            </div>
          </section>

          {/* Quick Reference Card */}
          <section className="dk-card dk-task-card" aria-labelledby="quicklinks-heading">
            <div className="dk-card-header-flex" style={{ marginBottom: 14 }}>
              <h2 id="quicklinks-heading" style={{ fontSize: 14 }}>
                Quick Reference
              </h2>
            </div>
            <dl className="dk-fact-grid" style={{ gridTemplateColumns: "1fr", gap: 12 }}>
              <Fact label="Task ID">
                <span className="dk-ref-code" title={`Database UUID: ${task.id}`} style={{ fontSize: 12, fontWeight: 650 }}>
                  {formattedRef}
                </span>
              </Fact>
              {task.bookingId ? (
                <Fact label="Linked Booking">
                  <AppLink
                    href={`/bookings/${task.bookingId}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
                  >
                    <span>{formatReferenceId(task.bookingId, "BK")}</span>
                    <ExternalLinkIcon />
                  </AppLink>
                </Fact>
              ) : null}
              <Fact label="Poster Account">
                <span style={{ fontSize: 13, fontWeight: 600 }}>{task.clientDisplayName}</span>
              </Fact>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
