import type { Metadata } from "next";
import { formatPhp } from "@dizkarte/domain";
import { getAdminRepository } from "@/lib/repository";
import { requireAdminSession } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireAdminSession();
  const repository = getAdminRepository();
  const snapshot = await repository.getDashboardSnapshot();

  const cards: ReadonlyArray<{
    href: string;
    label: string;
    value: string;
    hint: string;
    visible: boolean;
  }> = [
    {
      href: "/verification?status=SUBMITTED",
      label: "Identity verification queue",
      value: String(snapshot.pendingVerificationCount),
      hint: "Cases awaiting a decision",
      visible: true,
    },
    {
      href: "/taskers?status=SUBMITTED",
      label: "Tasker applications queue",
      value: String(snapshot.pendingTaskerApplicationCount),
      hint: "Applications awaiting review",
      visible: true,
    },
    {
      href: "/reports?status=OPEN",
      label: "Open reports",
      value: String(snapshot.openReportCount),
      hint: "Unresolved user reports",
      visible: true,
    },
    {
      href: "/disputes?status=OPEN",
      label: "Open disputes",
      value: String(snapshot.openDisputeCount),
      hint: "Bookings under dispute",
      visible: true,
    },
    {
      href: "/support?status=OPEN",
      label: "Open support tickets",
      value: String(snapshot.openTicketCount),
      hint: "Tickets awaiting a reply",
      visible: true,
    },
    {
      href: "/bookings?status=DISPUTED",
      label: "Bookings needing attention",
      value: String(snapshot.attentionBookingCount),
      hint: "Disputed or payment-failed bookings",
      visible: true,
    },
    {
      href: "/payments?status=QUARANTINED",
      label: "Quarantined payment events",
      value: String(snapshot.quarantinedPaymentEventCount),
      hint: "Webhook events needing reconciliation",
      visible:
        session.capabilities.includes("ADMIN_FINANCE") ||
        session.capabilities.includes("ADMIN_SUPER"),
    },
    {
      href: "/withdrawals?status=REQUESTED",
      label: "Pending withdrawals",
      value: String(snapshot.pendingWithdrawalCount),
      hint: "Payout requests awaiting action",
      visible:
        session.capabilities.includes("ADMIN_FINANCE") ||
        session.capabilities.includes("ADMIN_SUPER"),
    },
    {
      href: "/payments",
      label: "Ledger balance (all events)",
      value: formatPhp(snapshot.netLedgerBalanceCentavos),
      hint: "Sum of processed provider events — reconciliation view, not a live P&L",
      visible:
        session.capabilities.includes("ADMIN_FINANCE") ||
        session.capabilities.includes("ADMIN_SUPER"),
    },
  ];

  return (
    <section>
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">Dashboard</h1>
          <p className="dk-page-subtitle">
            Welcome, {session.displayName}. These are actionable operational queues, not vanity
            metrics — each card links directly to the underlying list.
          </p>
        </div>
      </div>
      <div className="dk-card-grid">
        {cards
          .filter((card) => card.visible)
          .map((card) => (
            <a key={card.href} href={card.href} className="dk-stat-card">
              <span className="dk-stat-card-label">{card.label}</span>
              <span className="dk-stat-card-value">{card.value}</span>
              <span className="dk-stat-card-hint">{card.hint}</span>
            </a>
          ))}
      </div>
    </section>
  );
}
