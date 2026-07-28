import type { Metadata } from "next";
import type { ReactNode } from "react";
import { formatPhp } from "@dizkarte/domain";
import { getAdminRepository } from "@/lib/repository";
import { requireAdminSession } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

type MetricCard = {
  readonly href: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly category: "operational" | "finance";
  readonly visible: boolean;
  readonly icon: ReactNode;
  readonly urgent?: boolean;
};

export default async function DashboardPage() {
  const session = await requireAdminSession();
  const repository = getAdminRepository();
  const snapshot = await repository.getDashboardSnapshot();

  const isFinanceOrSuper =
    session.capabilities.includes("ADMIN_FINANCE") ||
    session.capabilities.includes("ADMIN_SUPER");

  const cards: ReadonlyArray<MetricCard> = [
    {
      href: "/verification?status=SUBMITTED",
      label: "Identity verification queue",
      value: String(snapshot.pendingVerificationCount),
      hint: "Cases awaiting a decision",
      category: "operational",
      visible: true,
      urgent: snapshot.pendingVerificationCount > 0,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
    {
      href: "/taskers?status=SUBMITTED",
      label: "Tasker applications queue",
      value: String(snapshot.pendingTaskerApplicationCount),
      hint: "Applications awaiting review",
      category: "operational",
      visible: true,
      urgent: snapshot.pendingTaskerApplicationCount > 0,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <polyline points="16 11 18 13 22 9" />
        </svg>
      ),
    },
    {
      href: "/reports?status=OPEN",
      label: "Open reports",
      value: String(snapshot.openReportCount),
      hint: "Unresolved user reports",
      category: "operational",
      visible: true,
      urgent: snapshot.openReportCount > 0,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      ),
    },
    {
      href: "/disputes?status=OPEN",
      label: "Open disputes",
      value: String(snapshot.openDisputeCount),
      hint: "Bookings under dispute",
      category: "operational",
      visible: true,
      urgent: snapshot.openDisputeCount > 0,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
    {
      href: "/support?status=OPEN",
      label: "Open support tickets",
      value: String(snapshot.openTicketCount),
      hint: "Tickets awaiting a reply",
      category: "operational",
      visible: true,
      urgent: snapshot.openTicketCount > 0,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      href: "/bookings?status=DISPUTED",
      label: "Bookings needing attention",
      value: String(snapshot.attentionBookingCount),
      hint: "Disputed or payment-failed bookings",
      category: "operational",
      visible: true,
      urgent: snapshot.attentionBookingCount > 0,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      href: "/payments?status=QUARANTINED",
      label: "Quarantined payment events",
      value: String(snapshot.quarantinedPaymentEventCount),
      hint: "Webhook events needing reconciliation",
      category: "finance",
      visible: isFinanceOrSuper,
      urgent: snapshot.quarantinedPaymentEventCount > 0,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      ),
    },
    {
      href: "/withdrawals?status=REQUESTED",
      label: "Pending withdrawals",
      value: String(snapshot.pendingWithdrawalCount),
      hint: "Payout requests awaiting action",
      category: "finance",
      visible: isFinanceOrSuper,
      urgent: snapshot.pendingWithdrawalCount > 0,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      href: "/payments",
      label: "Ledger balance (all events)",
      value: formatPhp(snapshot.netLedgerBalanceCentavos),
      hint: "Sum of processed provider events — reconciliation view, not a live P&L",
      category: "finance",
      visible: isFinanceOrSuper,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
  ];

  const operationalCards = cards.filter((c) => c.visible && c.category === "operational");
  const financeCards = cards.filter((c) => c.visible && c.category === "finance");

  return (
    <section className="dk-stack" style={{ gap: 32 }}>
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">Executive Dashboard</h1>
          <p className="dk-page-subtitle">
            Welcome back, <strong>{session.displayName}</strong>. Actionable operational queues and
            financial oversight metrics below — select any card to open its management view.
          </p>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--dk-textPrimary)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--dk-primary)" }} />
            Operational Queues
          </h2>
          <span className="dk-badge dk-badge-neutral">{operationalCards.length} queues monitored</span>
        </div>
        <div className="dk-card-grid">
          {operationalCards.map((card) => (
            <a key={card.href} href={card.href} className="dk-stat-card">
              <span className="dk-stat-card-label">
                <span>{card.label}</span>
                <span className="dk-nav-link-icon" style={{ opacity: card.urgent ? 1 : 0.6, color: card.urgent ? "var(--dk-warningOnSoft)" : "inherit" }}>
                  {card.icon}
                </span>
              </span>
              <span className="dk-stat-card-value" style={{ color: card.urgent ? "var(--dk-textPrimary)" : undefined }}>
                {card.value}
              </span>
              <span className="dk-stat-card-hint">{card.hint}</span>
            </a>
          ))}
        </div>
      </div>

      {financeCards.length > 0 ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--dk-textPrimary)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--dk-successOnSoft)" }} />
              Financial Oversight & Reconciliation
            </h2>
            <span className="dk-badge dk-badge-info">Finance Admin Scope</span>
          </div>
          <div className="dk-card-grid">
            {financeCards.map((card) => (
              <a key={card.href} href={card.href} className="dk-stat-card">
                <span className="dk-stat-card-label">
                  <span>{card.label}</span>
                  <span className="dk-nav-link-icon" style={{ opacity: 0.8, color: "var(--dk-primary)" }}>
                    {card.icon}
                  </span>
                </span>
                <span className="dk-stat-card-value">{card.value}</span>
                <span className="dk-stat-card-hint">{card.hint}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

