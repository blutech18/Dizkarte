import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime, formatElapsed } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { BookingRecordSkeleton } from "./BookingSkeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  bookingEventSourceLabel,
  bookingStatusLabel,
  bookingStatusMeaning,
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

/**
 * Booking record.
 *
 * The whole body is one record, so the shell that can be shown without waiting
 * is deliberately small: the breadcrumb trail and the way back to the queue.
 * Those are exactly what an operator needs if the record is slow — proof they are
 * on the right page, and an escape hatch — so they are returned immediately and
 * the record streams in behind its own boundary.
 *
 * The final breadcrumb is a static label rather than the task title: the title is
 * already the page's `h1`, so repeating it bought nothing and would have held the
 * whole trail back until the query returned.
 */
export default async function BookingDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;

  return (
    <div className="dk-detail">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Bookings", href: "/bookings" },
          { label: "Booking" },
        ]}
      />

      <Suspense fallback={<BookingRecordSkeleton />}>
        <BookingRecord bookingId={id} />
      </Suspense>

      <p>
        <AppLink href="/bookings">Back to bookings</AppLink>
      </p>
    </div>
  );
}

async function BookingRecord({ bookingId }: { readonly bookingId: string }) {
  const booking = await getAdminRepository().getBooking(bookingId);
  if (!booking) notFound();

  const steps = bookingFlowSteps(booking.status, booking.timeline);
  // Newest first for reading; the durations below need chronological order.
  const history = [...booking.timeline].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  return (
    <>
      {/*
        Status stated once, with the sentence saying where the money sits, then
        the four facts an escalation actually opens with: the amount, both
        participants, and how long it has been sitting in this state.
      */}
      <header className="dk-detail-header">
        <div className="dk-detail-header-main">
          <h1>{booking.taskTitle}</h1>
          <StatusBadge
            tone={bookingTone(booking.status)}
            label={bookingStatusLabel(booking.status)}
          />
        </div>
        <p className="dk-detail-header-meaning">{bookingStatusMeaning(booking.status)}</p>
        <dl className="dk-detail-header-meta">
          {/*
            The peso sign already states the currency, so naming it again was
            duplicate. It is kept only if a booking is ever not in pesos, where
            the sign alone would be misleading.
          */}
          <Fact label="Agreed amount">
            <span className="dk-fact-amount">{formatPhp(booking.agreedCentavos)}</span>
            {booking.currency === "PHP" ? null : ` ${booking.currency}`}
          </Fact>
          <Fact label="Client">{booking.clientDisplayName}</Fact>
          <Fact label="Tasker">{booking.taskerDisplayName}</Fact>
          <Fact label="In this state for">
            <time dateTime={booking.updatedAt}>{formatElapsed(booking.updatedAt)}</time>
          </Fact>
        </dl>
      </header>

      {/*
        Progress is derived from the recorded events, so it answers "were funds
        ever held?" without the agent reading the history first.
      */}
      <section className="dk-card" aria-labelledby="progress-heading">
        <h2 id="progress-heading">Progress</h2>
        <ol className="dk-flow">
          {steps.map((step) => (
            <li
              key={step.status}
              className={`dk-flow-step dk-flow-step-${step.state}`}
              {...(step.state === "current" ? { "aria-current": "step" as const } : {})}
            >
              <span className="dk-flow-marker" aria-hidden="true" />
              <span className="dk-flow-label">{bookingStatusLabel(step.status)}</span>
              <span className="dk-visually-hidden">{flowStateDescription(step.state)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="dk-card" aria-labelledby="record-heading">
        <h2 id="record-heading">Record</h2>
        <dl className="dk-fact-grid">
          <Fact label="Opened">
            <time dateTime={booking.createdAt}>{formatDateTime(booking.createdAt)}</time>
          </Fact>
          <Fact label="Last change">
            <time dateTime={booking.updatedAt}>{formatDateTime(booking.updatedAt)}</time>
          </Fact>
          <Fact label="Payment">
            {booking.paymentIntentId ? (
              <AppLink href={`/payments/${booking.paymentIntentId}`}>
                {booking.paymentStatus ? paymentStatusLabel(booking.paymentStatus) : "View payment"}
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
        <p className="dk-card-note">
          Contact details, the exact address, and chat contents are not shown here.
        </p>
      </section>

      <section className="dk-card" aria-labelledby="history-heading">
        <h2 id="history-heading">History</h2>
        {history.length === 0 ? (
          <p className="dk-muted">
            No change recorded yet. Events are written as the work progresses.
          </p>
        ) : (
          <ol className="dk-history">
            {history.map((event, index) => {
              // How long the booking then sat in the state this event moved it
              // into: up to the next change, or up to now for the newest event.
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
    </>
  );
}



