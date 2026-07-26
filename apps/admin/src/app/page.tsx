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
  text: string;
}> = [
  {
    icon: ShieldIcon,
    title: "Identity & Tasker verification",
    text: "Review submitted IDs and Tasker applications with an auditable approve/reject/resubmit trail.",
  },
  {
    icon: GridIcon,
    title: "Marketplace oversight",
    text: "Moderate users, tasks, and media with privacy-safe fields and audited actions.",
  },
  {
    icon: TagIcon,
    title: "Categories",
    text: "Create, reorder, and deactivate service categories without ever deleting history.",
  },
  {
    icon: ChatIcon,
    title: "Support & disputes",
    text: "Assign reports, tickets, and disputes with full status and evidence history.",
  },
  {
    icon: WalletIcon,
    title: "Payments & payouts",
    text: "Ledger-derived balances, reconciliation, refunds, and Tasker withdrawals in one place.",
  },
  {
    icon: ClipboardIcon,
    title: "Audit log",
    text: "Every sensitive action recorded with actor, capability, reason, and timestamp.",
  },
];

/**
 * Public overview / landing page for the Admin console.
 *
 * Signed-in Admins are sent straight to the dashboard; signed-out visitors see
 * a marketing-style overview of what the console does before signing in —
 * mirroring the "logged-out home + sign in" split of a consumer marketplace
 * app rather than an immediate bare login form.
 */
export default async function RootPage() {
  const session = await readSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="dk-landing">
      <PublicHeader variant="landing" />

      <section className="dk-hero">
        <span className="dk-hero-badge">Dizkarte Admin console</span>
        <h1 className="dk-hero-title">Run the Dizkarte marketplace, safely.</h1>
        <p className="dk-hero-subtitle">
          Verify identities, moderate tasks, resolve disputes, and manage payouts from one
          protected console — every sensitive action is gated by capability and recorded in the
          audit log.
        </p>
        <div className="dk-hero-actions">
          <LinkButton href="/login" variant="primary">
            Admin sign in
          </LinkButton>
          <LinkButton href="https://www.dizkarte.ph" variant="secondary">
            Visit Dizkarte
          </LinkButton>
        </div>
        <div className="dk-hero-stats">
          <div>
            <div className="dk-hero-stat-value">4</div>
            <div className="dk-hero-stat-label">Admin capabilities</div>
          </div>
          <div>
            <div className="dk-hero-stat-value">100%</div>
            <div className="dk-hero-stat-label">Actions audited</div>
          </div>
          <div>
            <div className="dk-hero-stat-value">0</div>
            <div className="dk-hero-stat-label">Unlogged privileged reads</div>
          </div>
        </div>
      </section>

      <section className="dk-section">
        <h2 className="dk-section-title">Everything the team needs</h2>
        <p className="dk-section-subtitle">
          Capability-gated modules for verification, trust & safety, finance, and governance.
        </p>
        <div className="dk-chip-grid">
          {MODULES.map((module) => (
            <div className="dk-chip-card" key={module.title}>
              <span className="dk-chip-icon" aria-hidden="true">
                <module.icon width={24} height={24} />
              </span>
              <span className="dk-chip-title">{module.title}</span>
              <p className="dk-chip-text">{module.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="dk-landing-footer">
        Dizkarte Admin is a protected internal console. Access requires an authorized Admin
        capability.
      </footer>
    </div>
  );
}
