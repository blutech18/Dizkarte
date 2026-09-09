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
 * Platform revenue, derived from the append-only ledger.
 *
 * Every figure is a balanced projection over double-entry accounting transactions.
 * Zero mutable balances exist in the architecture.
 */
export default async function RevenuePage() {
  await requirePageCapability(["ADMIN_FINANCE"]);

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Revenue" }]} />
      <PageSection
        title="Revenue"
        subtitle="Derived from the append-only ledger. Platform fee is net commercial revenue; other measures represent marketplace funds in transit."
      >
        <div className="dk-detail">
          <Suspense fallback={<DetailRegionSkeleton cards={3} lines={3} />}>
            <RevenueSummary />
          </Suspense>
        </div>
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
      badge: "Net revenue",
      badgeTone: "success" as const,
      help: feeConfigured
        ? `Sum of PLATFORM_FEE ledger entries at ${summary.platformFeeBps} bps (${(summary.platformFeeBps / 100).toFixed(2)}%).`
        : "The platform fee is currently set to 0 bps, so no commercial fee has been deducted from bookings.",
    },
    {
      label: "Payments captured",
      value: summary.capturedCentavos,
      badge: "Gross inflow",
      badgeTone: "info" as const,
      help: "Total client funds confirmed by the payment gateway and protected in escrow.",
    },
    {
      label: "Released to Taskers",
      value: summary.releasedCentavos,
      badge: "Disbursed",
      badgeTone: "brand" as const,
      help: "Payouts released from escrow following client confirmation of task completion.",
    },
    {
      label: "Currently in escrow",
      value: summary.protectedCentavos,
      badge: "Protected",
      badgeTone: "warning" as const,
      help: "Customer funds currently held securely in protection against ongoing or pending bookings.",
    },
    {
      label: "Refunded to Clients",
      value: summary.refundedCentavos,
      badge: "Reversals",
      badgeTone: "neutral" as const,
      help: "Funds returned to clients upon dispute resolution or cancellation. Never rewrites ledger history.",
    },
  ];

  return (
    <>
      {summary.synthetic ? (
        <div
          style={{
            background: "var(--dk-surfaceSubtle)",
            border: "1px solid var(--dk-borderSubtle)",
            borderRadius: "var(--dk-radius-md)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <StatusBadge tone="warning" label="Synthetic Ledger" />
          <span style={{ fontSize: 13, color: "var(--dk-textSecondary)" }}>
            These figures are calculated from the in-memory synthetic development ledger.
          </span>
        </div>
      ) : null}

      {!feeConfigured ? (
        <section className="dk-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Commercial Fee Policy</h2>
            <StatusBadge tone="info" label="0 bps Active" />
          </div>
          <p className="dk-card-note" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
            <code>platform_fee_bps</code> is currently 0. The platform operates with a 0% commission rate during early beta, so platform revenue is genuinely zero. Rates can be configured in governance settings.
          </p>
        </section>
      ) : null}

      {/* Revenue Metric Cards Grid */}
      <section className="dk-card" aria-labelledby="measures-heading" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 id="measures-heading" style={{ margin: 0, fontSize: 16 }}>Financial Overview & Money Flow</h2>
          <span style={{ fontSize: 12.5, color: "var(--dk-textSecondary)" }}>Immutable double-entry calculations</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {money.map((item) => (
            <div
              key={item.label}
              style={{
                background: "var(--dk-surfaceSubtle)",
                border: "1px solid var(--dk-borderSubtle)",
                borderRadius: "var(--dk-radius-sm)",
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--dk-textSecondary)" }}>
                  {item.label}
                </span>
                <StatusBadge tone={item.badgeTone} label={item.badge} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "var(--dk-textPrimary)", letterSpacing: "-0.02em" }}>
                {formatPhpSigned(item.value)}
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--dk-textSecondary)", lineHeight: 1.45 }}>
                {item.help}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Ledger Integrity Card */}
      <section className="dk-card" aria-labelledby="integrity-heading">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 id="integrity-heading" style={{ margin: 0, fontSize: 16 }}>Ledger Audit & Balance Integrity</h2>
          <StatusBadge
            tone={summary.ledgerBalanceCentavos === 0 ? "success" : "error"}
            label={summary.ledgerBalanceCentavos === 0 ? "Balanced (0.00)" : "Discrepancy Detected"}
          />
        </div>

        <div
          style={{
            background: "var(--dk-surfaceSubtle)",
            border: `1px solid ${summary.ledgerBalanceCentavos === 0 ? "var(--dk-borderSubtle)" : "var(--dk-errorSoft)"}`,
            borderRadius: "var(--dk-radius-sm)",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dk-textSecondary)" }}>
              Net sum of all debit and credit ledger transactions
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {formatPhpSigned(summary.ledgerBalanceCentavos)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--dk-textSecondary)", lineHeight: 1.5 }}>
            {summary.ledgerBalanceCentavos === 0
              ? "The ledger is balanced in accordance with GAAP double-entry requirements. Every credit has an equal and corresponding debit."
              : "Warning: An unbalance has been detected across historical transactions. Requires immediate reconciliation review."}
          </p>
        </div>
      </section>
    </>
  );
}
