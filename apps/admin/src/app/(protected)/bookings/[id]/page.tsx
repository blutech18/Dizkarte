import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/ui/AppLink";
import { LinkButton } from "@/components/ui/Button";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime, formatElapsed } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import type { BookingDetail } from "@/lib/repository/types";
import { Breadcrumbs } from "@/components/ui/Field";
import { BookingRecordSkeleton } from "./BookingSkeleton";
import {
  bookingEventSourceLabel,
  bookingStatusLabel,
  bookingTone,
} from "../status";
import { bookingFlowSteps, flowStateDescription } from "../flow";
import { paymentStatusLabel } from "../../payments/status";

export const metadata: Metadata = { title: "Booking" };

function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function getInitials(name: string): string {
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

function ArrowLeftIcon() {
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
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}


function CheckIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon() {
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
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ShieldIcon() {
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
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ExternalLinkIcon() {
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
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/**
 * Booking detail page.
 *
 * Clean, modern layout presenting the booking's lifecycle stage, agreed financials,
 * participants, associated task, and full transition history with high visual hierarchy.
 */
export default async function BookingDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;
  const booking = await getAdminRepository().getBooking(id);
  if (!booking) notFound();

  return (
    <div className="dk-detail">
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Bookings", href: "/bookings" },
            { label: "Booking" },
          ]}
        />
        <AppLink href="/bookings" className="dk-back-btn">
          <ArrowLeftIcon />
          <span>Back to bookings</span>
        </AppLink>
        <span className="dk-booking-ref-text" title={id}>
          Booking Ref: {formatReferenceId(id, "BK", booking.createdAt)}
        </span>
      </nav>

      <Suspense fallback={<BookingRecordSkeleton />}>
        <BookingRecord bookingId={id} bookingInitial={booking} />
      </Suspense>
    </div>
  );
}

async function BookingRecord({
  bookingId,
  bookingInitial,
}: {
  readonly bookingId: string;
  readonly bookingInitial?: BookingDetail | null;
}) {
  const booking = bookingInitial ?? (await getAdminRepository().getBooking(bookingId));
  if (!booking) notFound();

  const steps = bookingFlowSteps(booking.status, booking.timeline);
  // Newest first for reading; the durations below need chronological order.
  const history = [...booking.timeline].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  const currentStepNumber = steps.findIndex((step) => step.state === "current") + 1;

  return (
    <>
      {/* Hero Header Card */}
      <header className="dk-booking-hero">
        <div className="dk-card-header-flex" style={{ marginBottom: 18 }}>
          <h1 className="dk-booking-hero-title" style={{ margin: 0 }}>
            {booking.taskTitle}
          </h1>
          <div className="dk-status-action-row">
            <div className="dk-status-action-state">
              <span
                className={`dk-status-action-dot dk-status-action-dot-${bookingTone(booking.status)}`}
                aria-hidden="true"
              />
              <span className="dk-status-action-label">{bookingStatusLabel(booking.status)}</span>
            </div>
            {booking.taskId ? (
              <>
                <div className="dk-status-action-divider" aria-hidden="true" />
                <AppLink
                  href={`/tasks/${booking.taskId}`}
                  className="dk-status-action-btn"
                  title="View task"
                >
                  <span>View task</span>
                  <ExternalLinkIcon />
                </AppLink>
              </>
            ) : null}
          </div>
        </div>

        <dl className="dk-detail-header-meta dk-booking-metrics">
          <Fact label="Agreed amount">
            <span className="dk-fact-amount">{formatPhp(booking.agreedCentavos)}</span>
            {booking.currency === "PHP" ? null : ` ${booking.currency}`}
          </Fact>
          <Fact label="Client">
            <span className="dk-metric-avatar" aria-hidden="true">
              {getInitials(booking.clientDisplayName)}
            </span>
            <span>{booking.clientDisplayName}</span>
          </Fact>
          <Fact label="Tasker">
            <span className="dk-metric-avatar dk-metric-avatar-tasker" aria-hidden="true">
              {getInitials(booking.taskerDisplayName)}
            </span>
            <span>{booking.taskerDisplayName}</span>
          </Fact>
          <Fact label="In this state for">
            <span className="dk-metric-time-badge">
              <ClockIcon />
              <time dateTime={booking.updatedAt}>{formatElapsed(booking.updatedAt)}</time>
            </span>
          </Fact>
        </dl>
      </header>

      {/* Progress Lifecycle Stepper Card */}
      <section className="dk-card dk-flow-card" aria-labelledby="progress-heading">
        <div className="dk-card-header-flex">
          <h2 id="progress-heading">Progress</h2>
          <span className="dk-card-badge">
            Step {currentStepNumber} of {steps.length}
          </span>
        </div>
        <ol className="dk-flow">
          {steps.map((step) => (
            <li
              key={step.status}
              className={`dk-flow-step dk-flow-step-${step.state}`}
              {...(step.state === "current" ? { "aria-current": "step" as const } : {})}
            >
              <span className="dk-flow-marker" aria-hidden="true">
                {step.state === "done" ? <CheckIcon /> : null}
              </span>
              <span className="dk-flow-label">{bookingStatusLabel(step.status)}</span>
              <span className="dk-visually-hidden">{flowStateDescription(step.state)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Two-Column Responsive Layout */}
      <div className="dk-booking-grid">
        {/* Left Column: Task & History */}
        <div className="dk-booking-col">
          {/* Section 1: Associated Task & Participants */}
          <section className="dk-card" aria-labelledby="task-overview-heading">
            <div className="dk-card-header-flex">
              <h2 id="task-overview-heading">Associated Task</h2>
              <span className="dk-task-ref-header" title={booking.taskId}>
                <span className="dk-task-ref-label">Task Ref: </span>
                <span className="dk-task-ref-value">
                  {formatReferenceId(booking.taskId, "TSK", booking.createdAt)}
                </span>
              </span>
            </div>

            <div className="dk-task-body">
              <div className="dk-task-title-row">
                <div className="dk-task-title-group">
                  <span className="dk-task-title-label">Task Title</span>
                  <p className="dk-task-title-value">{booking.taskTitle}</p>
                </div>
                <LinkButton
                  href={`/tasks/${booking.taskId}`}
                  variant="secondary"
                  size="sm"
                  className="dk-task-view-btn"
                >
                  <span>View task details</span>
                  <ExternalLinkIcon />
                </LinkButton>
              </div>

              <dl className="dk-fact-grid">
                <Fact label="Client">
                  <span className="dk-fact-participant">
                    <span className="dk-participant-avatar" aria-hidden="true">
                      {getInitials(booking.clientDisplayName)}
                    </span>
                    <span>{booking.clientDisplayName}</span>
                  </span>
                </Fact>
                <Fact label="Tasker">
                  <span className="dk-fact-participant">
                    <span
                      className="dk-participant-avatar dk-participant-avatar-tasker"
                      aria-hidden="true"
                    >
                      {getInitials(booking.taskerDisplayName)}
                    </span>
                    <span>{booking.taskerDisplayName}</span>
                  </span>
                </Fact>
              </dl>
            </div>
          </section>

          {/* Section 2: Lifecycle History */}
          <section className="dk-card" aria-labelledby="history-heading">
            <div className="dk-card-header-flex">
              <h2 id="history-heading">History</h2>
              <span className="dk-card-badge">
                {history.length} {history.length === 1 ? "event" : "events"} recorded
              </span>
            </div>
            {history.length === 0 ? (
              <p className="dk-muted">
                No change recorded yet. Events are written as the work progresses.
              </p>
            ) : (
              <ol className="dk-history">
                {history.map((event, index) => {
                  const next = history[index - 1];
                  const held = formatElapsed(event.at, next ? new Date(next.at) : new Date());
                  return (
                    <li key={event.id}>
                      <div className="dk-history-head">
                        <strong>
                          {event.fromStatus
                            ? `${bookingStatusLabel(event.fromStatus)} → ${bookingStatusLabel(event.toStatus)}`
                            : bookingStatusLabel(event.toStatus)}
                        </strong>
                        <time className="dk-history-time" dateTime={event.at}>
                          {formatDateTime(event.at)}
                        </time>
                      </div>
                      <p className="dk-history-meta">
                        {event.actor} · {bookingEventSourceLabel(event.source)} ·{" "}
                        {next ? "held" : "held since"} {held}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Right Column: Financial Protection & Record */}
        <div className="dk-booking-col">
          {/* Section 1: Payment & Escrow Protection */}
          <section className="dk-card" aria-labelledby="finance-heading">
            <div className="dk-card-header-flex">
              <h2 id="finance-heading">Payment & Escrow</h2>
              <ShieldIcon />
            </div>
            <div className="dk-finance-body">
              <div className="dk-finance-callout">
                <span className="dk-finance-callout-label">Agreed Protection Amount</span>
                <span className="dk-finance-callout-amount">{formatPhp(booking.agreedCentavos)}</span>
                <p className="dk-finance-callout-desc">
                  {booking.status === "COMPLETED"
                    ? "Escrow funds have been successfully released to the Tasker."
                    : "Funds remain safeguarded in Dizkarte Escrow until client verification."}
                </p>
              </div>

              <dl className="dk-fact-grid">
                <Fact label="Payment">
                  {booking.paymentIntentId ? (
                    <AppLink
                      href={`/payments/${booking.paymentIntentId}`}
                      title={booking.paymentIntentId}
                    >
                      {booking.paymentStatus
                        ? paymentStatusLabel(booking.paymentStatus)
                        : "View payment"}{" "}
                      ↗
                    </AppLink>
                  ) : (
                    <span className="dk-muted">No payment record yet</span>
                  )}
                </Fact>
                <Fact label="Dispute">
                  {booking.disputeId ? (
                    <AppLink href={`/disputes/${booking.disputeId}`}>Open dispute</AppLink>
                  ) : (
                    <span className="dk-muted">None</span>
                  )}
                </Fact>
              </dl>
            </div>
          </section>

          {/* Section 2: Record Metadata */}
          <section className="dk-card" aria-labelledby="record-heading">
            <div className="dk-card-header-flex">
              <h2 id="record-heading">Record</h2>
              <span className="dk-card-badge">Metadata</span>
            </div>
            <dl className="dk-fact-grid">
              <Fact label="Booking Ref">
                <span className="dk-ref-value" title={booking.id}>
                  {formatReferenceId(booking.id, "BK", booking.createdAt)}
                </span>
              </Fact>
              <Fact label="Opened">
                <time dateTime={booking.createdAt}>{formatDateTime(booking.createdAt)}</time>
              </Fact>
              <Fact label="Last change">
                <time dateTime={booking.updatedAt}>{formatDateTime(booking.updatedAt)}</time>
              </Fact>
            </dl>
            <p className="dk-card-note">
              Contact details, the exact address, and chat contents are not shown here.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
