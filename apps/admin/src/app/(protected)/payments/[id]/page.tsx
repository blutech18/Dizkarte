import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { PaymentActionsPanel } from "../PaymentActionsPanel";

export const metadata: Metadata = { title: "Payment detail" };

function intentTone(status: string): BadgeTone {
  switch (status) {
    case "RELEASED":
      return "success";
    case "REFUNDED":
      return "warning";
    case "FAILED":
      return "error";
    case "CAPTURED":
      return "info";
    default:
      return "neutral";
  }
}

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

export default async function PaymentDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_FINANCE"]);
  const { id } = await params;
  const repository = getAdminRepository();
  const [detail, availability] = await Promise.all([
    repository.getPaymentIntent(id),
    repository.getFinanceProviderAvailability(),
  ]);

  if (!detail) {
    notFound();
  }

  // Freezing only makes sense while funds are committed but not yet settled out.
  // CONFIRMED covers a provider-confirmed payment whose ledger movement has not
  // been recorded yet; RELEASED/REFUNDED/FAILED are terminal for this purpose.
  const freezeEligible =
    detail.status === "PROTECTED" ||
    detail.status === "CAPTURED" ||
    detail.status === "CONFIRMED";

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Payments & ledger", href: "/payments" },
          { label: detail.id },
        ]}
      />
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">Payment {detail.id}</h1>
          <p className="dk-page-subtitle">
            Booking {detail.bookingId} · {formatPhp(detail.amountCentavos)} · Created{" "}
            {new Date(detail.createdAt).toLocaleString("en-PH")}
          </p>
        </div>
        <StatusBadge tone={intentTone(detail.status)} label={detail.status} />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Live provider actions</h2>
        <p className="dk-muted">{availability.reason}</p>
        <PaymentActionsPanel
          paymentIntentId={detail.id}
          freezeEligible={freezeEligible}
          refundDisabledReason={availability.reason}
        />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Amounts</h2>
        <dl>
          <dt>Amount</dt>
          <dd>{formatPhp(detail.amountCentavos)}</dd>
          <dt>Platform fee</dt>
          <dd>{formatPhp(detail.platformFeeCentavos)}</dd>
          <dt>Total refunded</dt>
          <dd>{formatPhp(detail.refundSummary.totalRefundedCentavos)}</dd>
          <dt>Refund count</dt>
          <dd>{detail.refundSummary.refundCount}</dd>
        </dl>
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Reconciliation status</h2>
        <StatusBadge
          tone={reconciliationTone(detail.reconciliationStatus)}
          label={detail.reconciliationStatus}
        />
        <p className="dk-muted" style={{ marginTop: 8 }}>
          <a href={`/reconciliation?paymentIntentId=${detail.id}`}>View in reconciliation</a>
        </p>
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Provider events</h2>
        <p className="dk-muted">
          Reference metadata only — never a raw provider payload, signature, or secret.
        </p>
        {detail.providerEvents.length === 0 ? (
          <p className="dk-muted">No provider events recorded for this booking.</p>
        ) : (
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
                  <td>{event.type}</td>
                  <td>{formatPhp(event.amountCentavos)}</td>
                  <td>{event.status}</td>
                  <td>
                    <code>{event.providerReferenceLabel}</code>
                  </td>
                  <td>{new Date(event.receivedAt).toLocaleString("en-PH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Refund history</h2>
        {detail.refundHistory.length === 0 ? (
          <p className="dk-muted">No refunds have been recorded for this payment.</p>
        ) : (
          <table className="dk-table">
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
                  <td>{new Date(refund.at).toLocaleString("en-PH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>History</h2>
        <table className="dk-table">
          <caption className="dk-visually-hidden">Payment status history</caption>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col">Actor</th>
              <th scope="col">Capability</th>
              <th scope="col">Reason</th>
              <th scope="col">At</th>
            </tr>
          </thead>
          <tbody>
            {detail.history.map((event, index) => (
              <tr key={index}>
                <td>{event.fromValue ?? "—"}</td>
                <td>{event.toValue}</td>
                <td>{event.actor}</td>
                <td>{event.capability ?? "—"}</td>
                <td>{event.reason ?? "—"}</td>
                <td>{new Date(event.at).toLocaleString("en-PH")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
