import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { bookingTone } from "../status";

export const metadata: Metadata = { title: "Booking" };

export default async function BookingDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;
  const repository = getAdminRepository();
  const booking = await repository.getBooking(id);
  if (!booking) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Bookings", href: "/bookings" },
          { label: booking.taskTitle },
        ]}
      />
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">{booking.taskTitle}</h1>
          <p className="dk-page-subtitle">
            {formatPhp(booking.agreedCentavos)} {booking.currency} · {booking.clientDisplayName} →{" "}
            {booking.taskerDisplayName}
          </p>
        </div>
        <StatusBadge tone={bookingTone(booking.status)} label={booking.status} />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Booking</h2>
        <p className="dk-muted">
          Workflow oversight only. Participant contact details, the exact address, and chat contents
          are never shown here.
        </p>
        <dl>
          <dt>Agreed amount</dt>
          <dd>
            {formatPhp(booking.agreedCentavos)} {booking.currency}
          </dd>
          <dt>Client</dt>
          <dd>{booking.clientDisplayName}</dd>
          <dt>Tasker</dt>
          <dd>{booking.taskerDisplayName}</dd>
          <dt>Created</dt>
          <dd>{new Date(booking.createdAt).toLocaleString("en-PH")}</dd>
          <dt>Last updated</dt>
          <dd>{new Date(booking.updatedAt).toLocaleString("en-PH")}</dd>
        </dl>
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Related records</h2>
        <dl>
          <dt>Payment</dt>
          <dd>
            {booking.paymentIntentId ? (
              <Link href={`/payments/${booking.paymentIntentId}`}>
                {booking.paymentStatus ?? "View payment"}
              </Link>
            ) : (
              "No payment record yet"
            )}
          </dd>
          <dt>Dispute</dt>
          <dd>
            {booking.disputeId ? (
              <Link href={`/disputes/${booking.disputeId}`}>Open dispute</Link>
            ) : (
              "None"
            )}
          </dd>
        </dl>
        <p className="dk-muted">
          Offer contents are not shown: offer rows are readable only by the submitting Tasker, the
          task owner, or an Admin explicitly assigned to a case on that task. The agreed amount
          above is the booking&apos;s own record of the accepted offer.
        </p>
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Lifecycle</h2>
        {booking.timeline.length === 0 ? (
          <p className="dk-muted">
            No lifecycle events recorded yet. Events are written by the privileged booking commands
            as the work progresses.
          </p>
        ) : (
          <ol>
            {booking.timeline.map((event) => (
              <li key={event.id} style={{ marginBottom: 8 }}>
                <StatusBadge tone={bookingTone(event.toStatus)} label={event.toStatus} />{" "}
                <span className="dk-muted">
                  {event.fromStatus ? `from ${event.fromStatus}` : "(initial)"} · {event.actor} ·{" "}
                  {event.source} · {new Date(event.at).toLocaleString("en-PH")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
