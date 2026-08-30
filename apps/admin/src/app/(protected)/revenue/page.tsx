import type { Metadata } from "next";
import { Suspense } from "react";
import { formatPhpSigned } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection } from "@/components/ui/Pagination";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
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
 *
 * The shell — breadcrumbs, heading, and who is signed in — needs no query, so it
 * paints immediately and every ledger-derived figure streams in behind a single
 * Suspense boundary. There is one boundary rather than several because every card
 * reads from the same finance summary; splitting them would fan one query into
 * many for no gain.
 */
export default async function RevenuePage() {
  const session = await requirePageCapability(["ADMIN_FINANCE"]);

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Revenue" }]} />
      <PageSection
        title="Revenue"
        subtitle="Derived from the append-only ledger. Only the first figure is platform income — the rest is money moving through the platform on behalf of Clients and Taskers."
      >
        <div className="dk-detail">
          <Suspense fallback={<DetailRegionSkeleton cards={3} lines={3} />}>
            <RevenueSummary />
          </Suspense>
        </div>

        <p className="dk-field-description">Signed in as {session.displayName}.</p>
      </PageSection>
    </>
  );
}

async function RevenueSummary() {
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
      {summary.synthetic ? (
        <p className="dk-muted">
          <StatusBadge tone="warning" label="Development data" /> These totals come from the
          in-memory development ledger, not a live one.
        </p>
      ) : null}

      {!feeConfigured ? (
        <section className="dk-card">
          <h2>No platform fee is configured</h2>
          <p className="dk-card-note">
            <code>platform_fee_bps</code> is 0, so the platform currently takes nothing from a
            booking and platform revenue is genuinely zero — this is not missing data. A super Admin
            sets the rate once the commercial terms are agreed.
          </p>
        </section>
      ) : null}

      {/*
        Previously a three-column table with the explanation in the last cell,
        which squeezed the sentence that stops "Payments captured" being mistaken
        for income. Each measure now owns its full card width.
      */}
      <section className="dk-card" aria-labelledby="measures-heading">
        <h2 id="measures-heading">Revenue and money movement</h2>
        <dl className="dk-fact-grid">
          {money.map((row) => (
            <div className="dk-fact" key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <span className="dk-fact-amount">{formatPhpSigned(row.value)}</span>
                <span className="dk-fact-aside">{row.help}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="dk-card" aria-labelledby="integrity-heading">
        <h2 id="integrity-heading">Ledger integrity</h2>
        <dl className="dk-fact-grid">
          <div className="dk-fact">
            <dt>Net of every ledger entry</dt>
            <dd>
              <span className="dk-fact-amount">
                {formatPhpSigned(summary.ledgerBalanceCentavos)}
              </span>
              <span className="dk-fact-aside">
                {summary.ledgerBalanceCentavos === 0
                  ? "Balanced, as double-entry bookkeeping requires."
                  : "Unbalanced. A transaction was written unbalanced and needs investigating before these figures are trusted."}
              </span>
            </dd>
          </div>
        </dl>
        <p className="dk-card-note">
          Every transaction is double-entry, so this figure must be exactly zero.
        </p>
      </section>
    </>
  );
}
