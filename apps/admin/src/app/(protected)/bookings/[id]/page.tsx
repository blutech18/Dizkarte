import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { bookingStatusLabel, bookingStatusMeaning, bookingTone } from "../status";
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

      <Suspense fallback={<DetailRegionSkeleton cards={4} lines={3} />}>
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

  return (
    <>
      {/*
        Status stated once, with the sentence saying where the money sits. The
        previous header repeated the raw enum and the amount already shown below.
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
          <Fact label="Agreed amount">
            {formatPhp(booking.agreedCentavos)} {booking.currency}
          </Fact>
          <Fact label="Client">{booking.clientDisplayName}</Fact>
          <Fact label="Tasker">{booking.taskerDisplayName}</Fact>
        </dl>
      </header>

      <section className="dk-card" aria-labelledby="record-heading">
        <h2 id="record-heading">Booking record</h2>
        <dl className="dk-fact-grid">
          <Fact label="Created">
            <time dateTime={booking.createdAt}>{formatDateTime(booking.createdAt)}</time>
          </Fact>
          <Fact label="Last updated">
            <time dateTime={booking.updatedAt}>{formatDateTime(booking.updatedAt)}</time>
          </Fact>
        </dl>
        <p className="dk-card-note">
          Workflow oversight only. Participant contact details, the exact address, and chat contents
          are never shown here.
        </p>
      </section>

      <section className="dk-card" aria-labelledby="related-heading">
        <h2 id="related-heading">Related records</h2>
        <dl className="dk-fact-grid">
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
          Offer contents are not shown: offer rows are readable only by the submitting Tasker, the
          task owner, or an Admin assigned to a case on that task. The agreed amount is the
          booking&apos;s own record of the accepted offer.
        </p>
      </section>

      <section className="dk-card" aria-labelledby="lifecycle-heading">
        <h2 id="lifecycle-heading">Lifecycle</h2>
        {booking.timeline.length === 0 ? (
          <p className="dk-muted">
            No lifecycle event recorded yet. Events are written by the privileged booking commands
            as the work progresses.
          </p>
        ) : (
          <ol className="dk-history">
            {booking.timeline.map((event) => (
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
                  {event.actor} · {event.source}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

