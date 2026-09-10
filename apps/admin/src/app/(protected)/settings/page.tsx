import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { requirePageCapability } from "@/lib/guard";
import { loadServerConfig } from "@/lib/config";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection } from "@/components/ui/Pagination";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { AppLink } from "@/components/ui/AppLink";
import {
  CreditCardIcon,
  MapPinIcon,
  BellIcon,
  ImageIcon,
  ActivityIcon,
  LockIcon,
} from "@/components/shell/icons";
import { OperationalSettingForm } from "./OperationalSettingForm";

export const metadata: Metadata = { title: "Settings" };

/** Adapter mode is a deployment fact; the raw lowercase value is not a label. */
function adapterModeLabel(mode: string): string {
  switch (mode) {
    case "live":
      return "Live provider";
    case "synthetic":
      return "Synthetic";
    case "sandbox":
      return "Sandbox";
    default:
      return mode;
  }
}

function adapterModeTone(mode: string): BadgeTone {
  switch (mode) {
    case "live":
      return "success";
    case "synthetic":
      return "warning";
    default:
      return "info";
  }
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Operational settings workstation.
 *
 * Modeled after Dizkarte Admin's core detail pages (categories/[id], tasks/[id], bookings/[id]):
 *  - Standard Breadcrumbs & PageSection header with audit trail action.
 *  - Hero header card (.dk-booking-hero) with metrics overview (.dk-booking-metrics, .dk-fact-grid).
 *  - Responsive content grid (.dk-task-content-grid) with main column (1.85fr) and sidebar column (1fr).
 *  - Reusable design tokens (.dk-card, .dk-task-card, .dk-card-header-flex, .dk-card-title, .dk-table-wrap, .dk-table).
 */
export default async function SettingsPage() {
  await requirePageCapability(["ADMIN_SUPER"]);
  const config = loadServerConfig();

  const adapters = [
    {
      label: "Payment adapter",
      desc: "Maya / synthetic escrow & payout engine",
      mode: config.adapterModes.payment,
      icon: CreditCardIcon,
    },
    {
      label: "Map adapter",
      desc: "Routing, geocoding & geo-fencing service",
      mode: config.adapterModes.map,
      icon: MapPinIcon,
    },
    {
      label: "Push adapter",
      desc: "FCM / APNs real-time dispatch alerts",
      mode: config.adapterModes.push,
      icon: BellIcon,
    },
    {
      label: "Media adapter",
      desc: "Cloudflare Images / R2 identity asset store",
      mode: config.adapterModes.media,
      icon: ImageIcon,
    },
    {
      label: "Monitoring adapter",
      desc: "Error tracking & operational telemetry",
      mode: config.adapterModes.monitoring,
      icon: ActivityIcon,
    },
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]} />
      <PageSection
        title="Settings"
        subtitle="Platform configuration, operational parameters, governance policies, and deployment environment."
        actions={
          <AppLink
            href="/audit?action=setting.update"
            className="dk-btn dk-btn-secondary dk-btn-sm"
          >
            <span>View settings audit trail</span>
            <span aria-hidden="true">→</span>
          </AppLink>
        }
      >
        <div className="dk-detail">
          {/* Hero Header Card matching categories/[id], tasks/[id], bookings/[id] */}
          <header className="dk-booking-hero" style={{ marginBottom: 20 }}>
            <div className="dk-card-header-flex" style={{ marginBottom: 16 }}>
              <div>
                <h1
                  className="dk-booking-hero-title"
                  style={{ margin: 0, fontSize: "clamp(20px, 2.2vw, 26px)" }}
                >
                  Operational configuration
                </h1>
                <p
                  className="dk-detail-header-meaning"
                  style={{ margin: "4px 0 0 0", color: "var(--dk-textSecondary)" }}
                >
                  Live deployment environment, super-admin clearance, and external service
                  integrations.
                </p>
              </div>
              <StatusBadge
                tone={config.environment === "production" ? "success" : "info"}
                label={config.environment.toUpperCase()}
              />
            </div>

            <dl className="dk-detail-header-meta dk-booking-metrics">
              <Fact label="Deployment tier">
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        config.environment === "production"
                          ? "var(--dk-successSolid, #059669)"
                          : "var(--dk-warningSolid, #d97706)",
                      display: "inline-block",
                    }}
                  />
                  {config.environment.toUpperCase()}
                </span>
              </Fact>
              <Fact label="Clearance required">
                <span className="dk-ref-code" style={{ fontSize: 13 }}>
                  ADMIN_SUPER
                </span>
              </Fact>
              <Fact label="Service adapters">
                <span style={{ fontWeight: 700 }}>5 operational</span>
              </Fact>
              <Fact label="Audit compliance">
                <AppLink
                  href="/audit?action=setting.update"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    color: "var(--dk-primary)",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  <span>Immutable log</span>
                  <span aria-hidden="true">→</span>
                </AppLink>
              </Fact>
            </dl>
          </header>

          {/* Two-Column Responsive Content Grid matching categories/[id] and tasks/[id] */}
          <div className="dk-task-content-grid">
            {/* Main Column (1.85fr) */}
            <div className="dk-task-main-col">
              <Suspense fallback={<DetailRegionSkeleton cards={2} lines={3} />}>
                <ManagedSettings />
              </Suspense>
            </div>

            {/* Sidebar Column (1fr) */}
            <div className="dk-task-side-col">
              {/* Runtime Environment Card */}
              <section className="dk-card dk-task-card" aria-labelledby="environment-heading">
                <div className="dk-card-header-flex" style={{ marginBottom: 4 }}>
                  <h2 id="environment-heading" className="dk-card-title" style={{ margin: 0 }}>
                    Runtime environment
                  </h2>
                  <StatusBadge
                    tone={config.environment === "production" ? "success" : "info"}
                    label={config.environment.toUpperCase()}
                  />
                </div>
                <p className="dk-card-description" style={{ margin: "0 0 16px 0" }}>
                  Active deployment tier and external service adapters.
                </p>

                <div className="dk-table-wrap">
                  <table className="dk-table dk-table-desktop">
                    <thead>
                      <tr>
                        <th scope="col" style={{ textAlign: "left" }}>
                          Adapter
                        </th>
                        <th scope="col" style={{ textAlign: "right" }}>
                          Mode
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {adapters.map((adapter) => {
                        const Icon = adapter.icon;
                        return (
                          <tr key={adapter.label}>
                            <td style={{ textAlign: "left" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Icon
                                  style={{
                                    width: 15,
                                    height: 15,
                                    color: "var(--dk-textSecondary)",
                                    flexShrink: 0,
                                  }}
                                />
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                                    {adapter.label}
                                  </div>
                                  <div style={{ fontSize: 12, color: "var(--dk-textSecondary)" }}>
                                    {adapter.desc}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <StatusBadge
                                tone={adapterModeTone(adapter.mode)}
                                label={adapterModeLabel(adapter.mode)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Security & Audit Policy Card */}
              <section className="dk-card dk-task-card" aria-labelledby="security-heading">
                <div className="dk-card-header-flex" style={{ marginBottom: 4 }}>
                  <h2 id="security-heading" className="dk-card-title" style={{ margin: 0 }}>
                    Security & audit policy
                  </h2>
                  <span
                    className="dk-badge dk-badge--neutral"
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 11.5,
                      fontWeight: 600,
                    }}
                  >
                    ADMIN_SUPER
                  </span>
                </div>
                <p className="dk-card-description" style={{ margin: "0 0 14px 0" }}>
                  Governance and compliance auditing rules.
                </p>

                <p
                  style={{
                    margin: "0 0 16px 0",
                    fontSize: 13,
                    color: "var(--dk-textSecondary)",
                    lineHeight: 1.55,
                  }}
                >
                  Modifications to operational values require super-admin credentials and are
                  executed through capability-scoped RPCs. Every configuration mutation generates an
                  immutable, timestamped audit log entry with operator justification.
                </p>

                <div>
                  <AppLink
                    href="/audit?action=setting.update"
                    className="dk-btn dk-btn-secondary"
                    style={{ fontSize: 12.5, width: "100%", justifyContent: "center" }}
                  >
                    View settings audit trail →
                  </AppLink>
                </div>
              </section>
            </div>
          </div>
        </div>
      </PageSection>
    </>
  );
}

async function ManagedSettings() {
  const settings = await getAdminRepository().getSettings();

  return (
    <>
      {/* Operational Settings Card */}
      <section className="dk-card dk-task-card" aria-labelledby="operational-heading">
        <div className="dk-card-header-flex" style={{ marginBottom: 4 }}>
          <h2 id="operational-heading" className="dk-card-title" style={{ margin: 0 }}>
            Operational values
          </h2>
          <span
            className="dk-badge dk-badge--neutral"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, fontWeight: 600 }}
          >
            ADMIN_SUPER
          </span>
        </div>
        <p className="dk-card-description" style={{ margin: "0 0 18px 0" }}>
          Dynamic platform thresholds editable by super administrators.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {settings.editable.map((setting) => (
            <OperationalSettingForm key={setting.key} setting={setting} />
          ))}
        </div>
      </section>

      {/* Policy Card */}
      <section className="dk-card dk-task-card" aria-labelledby="policy-heading">
        <div className="dk-card-header-flex" style={{ marginBottom: 4 }}>
          <h2 id="policy-heading" className="dk-card-title" style={{ margin: 0 }}>
            Money and release policy
          </h2>
          <span
            className="dk-badge dk-badge--neutral"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, fontWeight: 600 }}
          >
            Client-owned (D3/D5/D13)
          </span>
        </div>
        <p className="dk-card-description" style={{ margin: "0 0 16px 0" }}>
          Client-owned marketplace rules governed by off-chain legal contracts.
        </p>

        <div className="dk-table-wrap">
          <table className="dk-table dk-table-desktop">
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left" }}>
                  Policy
                </th>
                <th scope="col" style={{ textAlign: "center", width: "16%" }}>
                  Ref
                </th>
                <th scope="col" style={{ textAlign: "center", width: "20%" }}>
                  Value
                </th>
                <th scope="col" style={{ textAlign: "left" }}>
                  Specification
                </th>
              </tr>
            </thead>
            <tbody>
              {settings.policy.map((item) => {
                const decisionMatch = item.note.match(/\(D\d+\)/);
                const decision = decisionMatch ? decisionMatch[0].replace(/[()]/g, "") : null;

                return (
                  <tr key={item.key}>
                    <td style={{ textAlign: "left", fontWeight: 600, fontSize: 13 }}>
                      {item.label}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {decision ? (
                        <span
                          style={{
                            fontFamily: "ui-monospace, monospace",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--dk-textSecondary)",
                            background: "var(--dk-surfaceSubtle)",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          [{decision}]
                        </span>
                      ) : (
                        <span style={{ color: "var(--dk-textSecondary)" }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        style={{
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "var(--dk-textPrimary)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <LockIcon
                          style={{ width: 12, height: 12, color: "var(--dk-textSecondary)" }}
                        />
                        {item.value}
                      </span>
                    </td>
                    <td
                      style={{
                        textAlign: "left",
                        fontSize: 12.5,
                        color: "var(--dk-textSecondary)",
                        lineHeight: 1.4,
                      }}
                    >
                      {item.note}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="dk-card-note">
          Commercial policies are client-owned. Threshold amendments require bilateral legal
          contract updates prior to code deployment.
        </p>
      </section>
    </>
  );
}
