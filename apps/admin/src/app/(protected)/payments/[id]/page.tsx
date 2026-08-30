import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { CaseHistoryList } from "@/components/ui/CaseHistoryList";
import { paymentStatusLabel, paymentStatusTone, reconciliationStatusLabel } from "../status";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { PaymentActionsPanel } from "../PaymentActionsPanel";

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

/**
 * Payment detail.
 *
 * Almost everything here is one payment intent, so the shell that can be shown
 * without waiting is deliberately small: the breadcrumb trail is the operator's
 * proof they are on the right page and their way back to the ledger, so it is
 * returned immediately while the record streams in behind its own boundary. The
 * provider-availability call runs in parallel with the intent inside that
 * boundary — the "Live provider actions" card needs both and every other card
 * needs the intent, so there is no independent region worth splitting off.
 *
 * The final breadcrumb is the static label "Payment" rather than the intent id,
 * which is already the page's h1: repeating it bought nothing and would have
 * held the whole trail back until the query returned.
 */
export default async function PaymentDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_FINANCE"]);
  const { id } = await params;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Payments & ledger", href: "/payments" },
          { label: "Payment" },
        ]}
      />
      <Suspense fallback={<DetailRegionSkeleton cards={7} lines={4} />}>
        <PaymentDetailRecord paymentIntentId={id} />
      </Suspense>
    </>
  );
}

async function PaymentDetailRecord({ paymentIntentId }: { readonly paymentIntentId: string }) {
  const repository = getAdminRepository();
  const [detail, availability] = await Promise.all([
    repository.getPaymentIntent(paymentIntentId),
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

  return (
    <div className="dk-detail">
      <header className="dk-detail-header">
        <div className="dk-detail-header-main">
          <h1>Payment on booking {detail.bookingId}</h1>
          <StatusBadge
            tone={paymentStatusTone(detail.status)}
            label={paymentStatusLabel(detail.status)}
          />
        </div>
        <dl className="dk-detail-header-meta">
          <div className="dk-fact">
            <dt>Amount</dt>
            <dd>{formatPhp(detail.amountCentavos)}</dd>
          </div>
          <div className="dk-fact">
            <dt>Created</dt>
            <dd>
              <time dateTime={detail.createdAt}>{formatDateTime(detail.createdAt)}</time>
            </dd>
          </div>
          <div className="dk-fact">
            <dt>Payment reference</dt>
            <dd>
              <code>{detail.id}</code>
            </dd>
          </div>
        </dl>
      </header>

      <div className="dk-card">
        <h2>Live provider actions</h2>
        <p className="dk-muted">{availability.reason}</p>
        <PaymentActionsPanel
          paymentIntentId={detail.id}
          freezeEligible={freezeEligible}
          refundDisabledReason={availability.reason}
        />
      </div>

      <div className="dk-card">
        <h2>Amounts</h2>
        <dl className="dk-fact-grid">
          <div className="dk-fact">
            <dt>Amount</dt>
            <dd>{formatPhp(detail.amountCentavos)}</dd>
          </div>
          <div className="dk-fact">
            <dt>Platform fee</dt>
            <dd>{formatPhp(detail.platformFeeCentavos)}</dd>
          </div>
          <div className="dk-fact">
            <dt>Total refunded</dt>
            <dd>{formatPhp(detail.refundSummary.totalRefundedCentavos)}</dd>
          </div>
          <div className="dk-fact">
            <dt>Refunds issued</dt>
            <dd>{detail.refundSummary.refundCount}</dd>
          </div>
        </dl>
      </div>

      <div className="dk-card">
        <h2>Reconciliation status</h2>
        <StatusBadge
          tone={reconciliationTone(detail.reconciliationStatus)}
          label={reconciliationStatusLabel(detail.reconciliationStatus)}
        />
        <p className="dk-card-note">
          <AppLink href={`/reconciliation?paymentIntentId=${detail.id}`}>
            View in reconciliation
          </AppLink>
        </p>
      </div>

      <div className="dk-card">
        <h2>Provider events</h2>
        <p className="dk-muted">
          Reference metadata only — never a raw provider payload, signature, or secret.
        </p>
        {detail.providerEvents.length === 0 ? (
          <p className="dk-muted">No provider events recorded for this booking.</p>
        ) : (
          <div className="dk-table-wrap"><table className="dk-table">
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
                  <td>{event.type}</td>
                  <td>{formatPhp(event.amountCentavos)}</td>
                  <td>{event.status}</td>
                  <td>
                    <code>{event.providerReferenceLabel}</code>
                  </td>
                  <td>{formatDateTime(event.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="dk-card">
        <h2>Refund history</h2>
        {detail.refundHistory.length === 0 ? (
          <p className="dk-muted">No refunds have been recorded for this payment.</p>
        ) : (
          <div className="dk-table-wrap"><table className="dk-table">
            <caption className="dk-visually-hidden">Refund history</caption>
            <thead>
              <tr>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Reason</th>
                <th scope="col">At</th>
              </tr>
            </thead>
            <tbody>
              {detail.refundHistory.map((refund) => (
                <tr key={refund.id}>
                  <td>{formatPhp(refund.amountCentavos)}</td>
                  <td>{refund.status}</td>
                  <td>{refund.reason ?? "—"}</td>
                  <td>{formatDateTime(refund.at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="dk-card">
        <h2>History</h2>
        <CaseHistoryList events={detail.history} statusLabel={paymentStatusLabel} />
      </div>
    </div>
  );
}




