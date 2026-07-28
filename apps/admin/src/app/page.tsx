import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { LinkButton } from "@/components/ui/Button";
import { ShieldIcon, TagIcon, ChatIcon, WalletIcon, ClipboardIcon, GridIcon } from "@/components/shell/icons";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const MODULES: ReadonlyArray<{
  icon: typeof ShieldIcon;
  title: string;
  badge: string;
  text: string;
}> = [
  {
    icon: ShieldIcon,
    title: "Identity & Verification",
    badge: "Trust & Safety",
    text: "Review submitted government IDs and Tasker applications with an auditable approve, reject, or resubmit decision trail.",
  },
  {
    icon: GridIcon,
    title: "Marketplace Oversight",
    badge: "Operations",
    text: "Moderate users, active listings, and media assets with privacy-safe projections and audited admin actions.",
  },
  {
    icon: TagIcon,
    title: "Service Categories",
    badge: "Taxonomy",
    text: "Create, reorder, and manage service categories dynamically while preserving historical booking integrity.",
  },
  {
    icon: ChatIcon,
    title: "Support & Disputes",
    badge: "Customer Care",
    text: "Assign reports, support tickets, and booking disputes with full evidence history and assignment locking.",
  },
  {
    icon: WalletIcon,
    title: "Payments & Payouts",
    badge: "Financials",
    text: "Ledger-derived balances, webhook reconciliation, refund processing, and Tasker withdrawal approvals.",
  },
  {
    icon: ClipboardIcon,
    title: "Immutable Audit Log",
    badge: "Governance",
    text: "Every sensitive administrative action is recorded with actor ID, capability, justification, and timestamp.",
  },
];

const TRUST_PILLARS = [
  {
    title: "Role-Based Access Control",
    desc: "Super Admin, Finance, and Support capabilities strictly isolate access boundaries.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    title: "Failsafe Data Privacy",
    desc: "Privacy-safe projections shield raw IDs, exact geolocation coordinates, and private messages.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    title: "Audited Ledger Reconciliation",
    desc: "Double-entry accounting principles guarantee zero ghost balances or unverified payouts.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    title: "Assignment Protection",
    desc: "Case detail narratives and evidence are locked exclusively to assigned team members.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </svg>
    ),
  },
];

export default async function RootPage() {
  const session = await readSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="dk-landing">
      <PublicHeader variant="landing" />

      {/* Hero Section */}
      <section className="dk-hero">
        <h1 className="dk-hero-title">Run the Dizkarte marketplace with total trust & governance.</h1>
        <p className="dk-hero-subtitle">
          Verify identities, moderate tasks, resolve disputes, and manage payouts from one
          protected console — every sensitive action is capability-gated and logged.
        </p>

        <div className="dk-hero-actions">
          <LinkButton href="https://www.dizkarte.ph" variant="secondary">
            Visit Dizkarte Main Site
          </LinkButton>
        </div>

        {/* Formal Unified Metric Banner */}
        <div className="dk-hero-metrics-bar">
          <div className="dk-hero-metric-cell">
            <span className="dk-hero-stat-value">4</span>
            <span className="dk-hero-stat-label">Admin Capabilities</span>
            <span className="dk-hero-stat-tag">Role-Based Access Control</span>
          </div>
          <div className="dk-hero-metric-cell">
            <span className="dk-hero-stat-value">100%</span>
            <span className="dk-hero-stat-label">Audited Operations</span>
            <span className="dk-hero-stat-tag">Immutable Action Logs</span>
          </div>
          <div className="dk-hero-metric-cell">
            <span className="dk-hero-stat-value">0</span>
            <span className="dk-hero-stat-label">Unlogged Privileged Reads</span>
            <span className="dk-hero-stat-tag">Failsafe Privacy Protection</span>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="dk-section">
        <div className="dk-section-header">
          <span className="dk-section-tag">Modular Operations</span>
          <h2 className="dk-section-title">Everything the team needs to govern</h2>
          <p className="dk-section-subtitle">
            Capability-gated modules engineered for verification, safety, compliance, and financial control.
          </p>
        </div>

        <div className="dk-chip-grid">
          {MODULES.map((module) => (
            <div className="dk-chip-card" key={module.title}>
              <div className="dk-chip-card-header">
                <div className="dk-chip-icon" aria-hidden="true">
                  <module.icon width={20} height={20} />
                </div>
                <span className="dk-chip-badge">{module.badge}</span>
              </div>
              <h3 className="dk-chip-title">{module.title}</h3>
              <p className="dk-chip-text">{module.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security & Governance Trust Banner */}
      <section className="dk-trust-section">
        <div className="dk-trust-container">
          {TRUST_PILLARS.map((pillar) => (
            <div key={pillar.title} className="dk-trust-item">
              <div className="dk-trust-icon" aria-hidden="true">
                {pillar.icon}
              </div>
              <div>
                <h4 className="dk-trust-title">{pillar.title}</h4>
                <p className="dk-trust-desc">{pillar.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="dk-landing-footer">
        Dizkarte Admin is a protected internal console. Access requires an authorized Admin capability.
      </footer>
    </div>
  );
}

