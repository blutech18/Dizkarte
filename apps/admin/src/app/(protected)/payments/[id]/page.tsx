import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import type { PaymentIntentDetail } from "@/lib/repository/types";
import { CaseHistoryList } from "@/components/ui/CaseHistoryList";
import { paymentStatusLabel, paymentStatusTone, reconciliationStatusLabel } from "../status";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { PaymentActionsPanel } from "../PaymentActionsPanel";
import { PaymentRecordSkeleton } from "./PaymentSkeleton";

export const metadata: Metadata = { title: "Payment detail" };

function reconciliationTone(status: string): BadgeTone {
  switch (status) {
    case "MATCHED":
      return "success";
    case "MISMATCH":
    case "QUARANTINED":
      return "error";
    case "DUPLICATE":
      return "warning";
    default:
      return "info";
  }
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

/**
 * Payment detail page.
 *
 * Clean, modern layout presenting the payment's financial position, ledger breakdown,
 * reconciliation status, live provider actions, and transition history in a balanced
 * two-column grid.
 */
export default async function PaymentDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_FINANCE"]);
  const { id } = await params;
  const detail = await getAdminRepository().getPaymentIntent(id);
  if (!detail) notFound();

  return (
    <div className="dk-detail">
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Payments & ledger", href: "/payments" },
            { label: "Payment" },
          ]}
        />
        <AppLink href="/payments" className="dk-back-btn">
          <ArrowLeftIcon />
          <span>Back to payments</span>
        </AppLink>
        <span className="dk-booking-ref-text" title={id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span>Payment Ref: {formatReferenceId(id, "PAY", detail.createdAt)}</span>
          <CopyButton text={id} label="payment reference ID" variant="icon" />
        </span>
      </nav>

      <Suspense fallback={<PaymentRecordSkeleton />}>
        <PaymentDetailRecord paymentIntentId={id} detailInitial={detail} />
      </Suspense>
    </div>
  );
}

async function PaymentDetailRecord({
  paymentIntentId,
  detailInitial,
}: {
  readonly paymentIntentId: string;
  readonly detailInitial?: PaymentIntentDetail | null;
}) {
  const repository = getAdminRepository();
  const [detail, availability] = await Promise.all([
    detailInitial ? Promise.resolve(detailInitial) : repository.getPaymentIntent(paymentIntentId),
    repository.getFinanceProviderAvailability(),
  ]);

  if (!detail) {
    notFound();
  }

  // Freezing only makes sense while funds are committed but not yet settled out.
  // CONFIRMED covers a provider-confirmed payment whose ledger movement has not
  // been recorded yet; RELEASED/REFUNDED/FAILED are terminal for this purpose.
  const freezeEligible =
    detail.status === "PROTECTED" || detail.status === "CAPTURED" || detail.status === "CONFIRMED";

  const formattedBookingRef = formatReferenceId(detail.bookingId, "BK", detail.createdAt);

  return (
    <>
      {/* Hero Header Card */}
      <header className="dk-booking-hero">
        <div className="dk-card-header-flex" style={{ marginBottom: 18 }}>
          <h1 className="dk-booking-hero-title" style={{ margin: 0 }}>
            Payment on Booking {formattedBookingRef}
          </h1>
          <div className="dk-status-action-row">
            <div className="dk-status-action-state">
              <span
                className={`dk-status-action-dot dk-status-action-dot-${paymentStatusTone(detail.status)}`}
                aria-hidden="true"
              />
              <span className="dk-status-action-label">{paymentStatusLabel(detail.status)}</span>
            </div>
            {detail.bookingId ? (
              <>
                <div className="dk-status-action-divider" aria-hidden="true" />
                <AppLink
                  href={`/bookings/${detail.bookingId}`}
                  className="dk-status-action-btn"
                  title={`View booking ${formattedBookingRef}`}
                >
                  <span>View booking</span>
                  <ExternalLinkIcon />
                </AppLink>
              </>
            ) : null}
          </div>
        </div>

        <dl className="dk-detail-header-meta dk-booking-metrics">
          <Fact label="Gross amount">
            <span className="dk-fact-amount">{formatPhp(detail.amountCentavos)}</span>
          </Fact>
          <Fact label="Platform fee">
            <span className="dk-fact-fee">{formatPhp(detail.platformFeeCentavos)}</span>
          </Fact>
          <Fact label="Booking reference">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <AppLink
                href={`/bookings/${detail.bookingId}`}
                className="dk-ref-link"
                title={detail.bookingId}
              >
                <span>{formattedBookingRef}</span>
                <ExternalLinkIcon />
              </AppLink>
              <CopyButton text={detail.bookingId} label="booking ID" variant="icon" />
            </div>
          </Fact>
          <Fact label="Created">
            <span className="dk-metric-time-badge">
              <ClockIcon />
              <time dateTime={detail.createdAt}>{formatDateTime(detail.createdAt)}</time>
            </span>
          </Fact>
        </dl>
      </header>

      {/* Two-Column Responsive Grid */}
      <div className="dk-booking-grid">
        {/* Left Column: Financial Breakdown, Reconciliation, Refunds */}
        <div className="dk-booking-col">
          {/* Section 1: Amounts Breakdown */}
          <section className="dk-card" aria-labelledby="amounts-heading">
            <div className="dk-card-header-flex">
              <h2 id="amounts-heading">Amounts Breakdown</h2>
              <ShieldIcon />
            </div>

            <div className="dk-finance-body">
              <div className="dk-finance-callout">
                <span className="dk-finance-callout-label">Net Platform Fee</span>
                <span className="dk-finance-callout-amount">
                  {formatPhp(detail.platformFeeCentavos)}
                </span>
                <p className="dk-finance-callout-desc">
                  Platform service fee retained from total escrow amount.
                </p>
              </div>

              <dl className="dk-fact-grid">
                <Fact label="Gross amount">
                  <span>{formatPhp(detail.amountCentavos)}</span>
                </Fact>
                <Fact label="Platform fee">
                  <span>{formatPhp(detail.platformFeeCentavos)}</span>
                </Fact>
                <Fact label="Total refunded">
                  <span>{formatPhp(detail.refundSummary.totalRefundedCentavos)}</span>
                </Fact>
                <Fact label="Refunds issued">
                  <span>{detail.refundSummary.refundCount}</span>
                </Fact>
              </dl>
            </div>
          </section>

          {/* Section 2: Reconciliation Status */}
          <section className="dk-card" aria-labelledby="reconciliation-heading">
            <div className="dk-card-header-flex">
              <h2 id="reconciliation-heading">Reconciliation Status</h2>
              <StatusBadge
                tone={reconciliationTone(detail.reconciliationStatus)}
                label={reconciliationStatusLabel(detail.reconciliationStatus)}
              />
            </div>
            <p className="dk-muted" style={{ margin: "0 0 14px" }}>
              Gateway settlement status against the internal accounting ledger.
            </p>
            <p className="dk-card-note" style={{ margin: 0 }}>
              <AppLink href={`/reconciliation?paymentIntentId=${detail.id}`} className="dk-ref-link">
                <span>View in reconciliation</span>
                <ExternalLinkIcon />
              </AppLink>
            </p>
          </section>

          {/* Section 3: Refund History */}
          <section className="dk-card" aria-labelledby="refunds-heading">
            <div className="dk-card-header-flex">
              <h2 id="refunds-heading">Refund History</h2>
              <span className="dk-card-badge">
                {detail.refundHistory.length}{" "}
                {detail.refundHistory.length === 1 ? "refund" : "refunds"}
              </span>
            </div>
            {detail.refundHistory.length === 0 ? (
              <p className="dk-muted" style={{ margin: 0 }}>
                No refunds have been recorded for this payment.
              </p>
            ) : (
              <div className="dk-table-wrap">
                <table className="dk-table">
                  <caption className="dk-visually-hidden">Refund history</caption>
                  <thead>
                    <tr>
                      <th scope="col">Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Reason</th>
                      <th scope="col">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.refundHistory.map((refund) => (
                      <tr key={refund.id}>
                        <td>
                          <strong>{formatPhp(refund.amountCentavos)}</strong>
                        </td>
                        <td>
                          <StatusBadge
                            tone={
                              refund.status === "SUCCEEDED"
                                ? "success"
                                : refund.status === "FAILED"
                                  ? "error"
                                  : "info"
                            }
                            label={refund.status}
                          />
                        </td>
                        <td>{refund.reason ?? "—"}</td>
                        <td>
                          <time dateTime={refund.at}>{formatDateTime(refund.at)}</time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Live Provider Actions, Provider Events, History */}
        <div className="dk-booking-col">
          {/* Section 1: Live Provider Actions */}
          <section className="dk-card" aria-labelledby="provider-actions-heading">
            <div className="dk-card-header-flex">
              <h2 id="provider-actions-heading">Live Provider Actions</h2>
              <span className="dk-card-badge">Provider</span>
            </div>
            {availability.reason ? (
              <p className="dk-muted" style={{ margin: "0 0 16px" }}>
                {availability.reason}
              </p>
            ) : null}
            <PaymentActionsPanel
              paymentIntentId={detail.id}
              freezeEligible={freezeEligible}
              refundDisabledReason={availability.reason}
            />
          </section>

          {/* Section 2: Provider Events */}
          <section className="dk-card" aria-labelledby="provider-events-heading">
            <div className="dk-card-header-flex">
              <h2 id="provider-events-heading">Provider Events</h2>
              <span className="dk-card-badge">
                {detail.providerEvents.length}{" "}
                {detail.providerEvents.length === 1 ? "event" : "events"}
              </span>
            </div>
            <p className="dk-muted" style={{ margin: "0 0 14px" }}>
              Reference metadata only — never a raw provider payload, signature, or secret.
            </p>
            {detail.providerEvents.length === 0 ? (
              <p className="dk-muted" style={{ margin: 0 }}>
                No provider events recorded for this payment.
              </p>
            ) : (
              <div className="dk-table-wrap">
                <table className="dk-table">
                  <caption className="dk-visually-hidden">Provider events</caption>
                  <thead>
                    <tr>
                      <th scope="col">Type</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Reference</th>
                      <th scope="col">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.providerEvents.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.type}</strong>
                        </td>
                        <td>{formatPhp(event.amountCentavos)}</td>
                        <td>
                          <span className="dk-code-pill">{event.status}</span>
                        </td>
                        <td>
                          <code>{event.providerReferenceLabel}</code>
                        </td>
                        <td>
                          <time dateTime={event.receivedAt}>
                            {formatDateTime(event.receivedAt)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 3: History */}
          <section className="dk-card" aria-labelledby="history-heading">
            <div className="dk-card-header-flex">
              <h2 id="history-heading">History</h2>
              <span className="dk-card-badge">
                {detail.history.length} {detail.history.length === 1 ? "event" : "events"}
              </span>
            </div>
            <CaseHistoryList events={detail.history} statusLabel={paymentStatusLabel} />
          </section>
        </div>
      </div>
    </>
  );
}




