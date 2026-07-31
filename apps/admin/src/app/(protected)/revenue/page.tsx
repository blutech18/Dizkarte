import type { Metadata } from "next";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const metadata: Metadata = { title: "Revenue" };

/**
 * Platform revenue, derived from the ledger.
 *
 * Every figure here is a projection over `ledger_entries`; no mutable balance
 * column is authoritative anywhere in this system, so there is nothing to reconcile
 * between this screen and the books.
 *
 * The platform fee is currently 0 bps, which makes platform revenue genuinely
 * zero. That is stated plainly rather than hidden behind an empty state, because
 * "no revenue yet" and "we are not charging a fee yet" are different facts and
 * only the second one is true.
 */
export default async function RevenuePage() {
  const session = await requirePageCapability(["ADMIN_FINANCE"]);
  const repository = getAdminRepository();
  const summary = await repository.getFinanceSummary();

  const feeConfigured = summary.platformFeeBps > 0;

  const money = [
    {
      label: "Platform fee earned",
      value: summary.platformFeeCentavos,
      help: feeConfigured
        ? `Sum of PLATFORM_FEE ledger entries at ${summary.platformFeeBps} bps.`
        : "The platform fee is set to 0 bps, so no fee has been charged on any booking.",
    },
    {
      label: "Payments captured",
      value: summary.capturedCentavos,
      help: "Total confirmed by the payment provider. Client money, not platform income.",
    },
    {
      label: "Released to Taskers",
      value: summary.releasedCentavos,
      help: "Moved out of escrow after a Client confirmed completion.",
    },
    {
      label: "Currently in escrow",
      value: summary.protectedCentavos,
      help: "Held against active bookings. Not available to anyone yet.",
    },
    {
      label: "Refunded",
      value: summary.refundedCentavos,
      help: "Returned to Clients. Reduces captured volume, never rewrites ledger history.",
    },
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Revenue" }]} />
      <PageSection
        title="Revenue"
        subtitle="Derived from the append-only ledger. Only the first figure is platform income — the rest is money moving through the platform on behalf of Clients and Taskers."
      >
        {summary.synthetic ? (
          <p className="dk-muted">
            <StatusBadge tone="warning" label="Development data" /> These totals come from the
            in-memory development ledger, not a live one.
          </p>
        ) : null}

        {!feeConfigured ? (
          <div className="dk-card">
            <h2 style={{ marginTop: 0 }}>No platform fee is configured</h2>
            <p className="dk-muted">
              <code>platform_fee_bps</code> is 0, so the platform currently takes nothing from a
              booking and platform revenue is genuinely zero — this is not missing data. A super
              Admin sets the rate once the commercial terms are agreed.
            </p>
          </div>
        ) : null}

        <div className="dk-card">
          <table className="dk-table">
            <caption className="dk-visually-hidden">Revenue and money movement</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Amount</th>
                <th scope="col">What it means</th>
              </tr>
            </thead>
            <tbody>
              {money.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{formatPhp(row.value)}</td>
                  <td className="dk-muted">{row.help}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="dk-card">
          <h2 style={{ marginTop: 0 }}>Ledger integrity</h2>
          <p>
            Net of every ledger entry:{" "}
            <strong>{formatPhp(summary.ledgerBalanceCentavos)}</strong>{" "}
            {summary.ledgerBalanceCentavos === 0 ? (
              <StatusBadge tone="success" label="Balanced" />
            ) : (
              <StatusBadge tone="error" label="Unbalanced" />
            )}
          </p>
          <p className="dk-muted">
            Every transaction is double-entry, so this must be exactly zero. Anything else means a
            transaction was written unbalanced and needs investigating before these figures are
            trusted.
          </p>
        </div>

        <p className="dk-field-description">Signed in as {session.displayName}.</p>
      </PageSection>
    </>
  );
}
