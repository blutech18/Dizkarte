import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePageCapability } from "@/lib/guard";
import { loadServerConfig } from "@/lib/config";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection } from "@/components/ui/Pagination";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { AppLink } from "@/components/ui/AppLink";
import { OperationalSettingForm } from "./OperationalSettingForm";

export const metadata: Metadata = { title: "Settings" };

/** Adapter mode is a deployment fact; the raw lowercase value is not a label. */
function adapterModeLabel(mode: string): string {
  switch (mode) {
    case "live":
      return "Live provider";
    case "synthetic":
      return "Synthetic (development)";
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

/**
 * Operational settings workstation.
 *
 * Provides a clean dual-column layout:
 *  - Main: Editable operational values and client-owned policies (D3/D5/D13).
 *  - Sidebar: Runtime environment, external provider adapters, and audit links.
 */
export default async function SettingsPage() {
  await requirePageCapability(["ADMIN_SUPER"]);
  const config = loadServerConfig();

  const adapters: ReadonlyArray<{ label: string; mode: string }> = [
    { label: "Payment adapter", mode: config.adapterModes.payment },
    { label: "Map adapter", mode: config.adapterModes.map },
    { label: "Push adapter", mode: config.adapterModes.push },
    { label: "Media adapter", mode: config.adapterModes.media },
    { label: "Monitoring adapter", mode: config.adapterModes.monitoring },
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]} />
      <PageSection
        title="Settings"
        subtitle="Editable operational values, client-owned financial and release policies, and runtime deployment metadata."
      >
        <div className="dk-report-grid">
          <div className="dk-report-main">
            <Suspense fallback={<DetailRegionSkeleton cards={2} lines={3} />}>
              <ManagedSettings />
            </Suspense>
          </div>

          <div className="dk-report-sidebar">
            <section className="dk-report-card" aria-labelledby="environment-heading">
              <div className="dk-report-card-head">
                <h2 id="environment-heading">Runtime environment</h2>
                <StatusBadge
                  tone={config.environment === "production" ? "success" : "info"}
                  label={config.environment}
                />
              </div>
              <dl className="dk-fact-grid">
                {adapters.map((adapter) => (
                  <div className="dk-fact" key={adapter.label}>
                    <dt>{adapter.label}</dt>
                    <dd>
                      <StatusBadge
                        tone={adapterModeTone(adapter.mode)}
                        label={adapterModeLabel(adapter.mode)}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="dk-report-card" aria-labelledby="security-heading">
              <div className="dk-report-card-head">
                <h2 id="security-heading">Security & audit policy</h2>
                <span className="dk-badge dk-badge--neutral text-xs font-mono">ADMIN_SUPER</span>
              </div>
              <p className="dk-card-note" style={{ margin: "0 0 16px 0", fontSize: 13.5, lineHeight: 1.5 }}>
                All modifications to operational values are executed through capability-scoped RPCs
                and logged with an immutable audit entry. Secrets and keys are never rendered in the console.
              </p>
              <div>
                <AppLink href="/audit?action=setting.update" className="dk-btn dk-btn-secondary text-xs">
                  View settings audit trail
                </AppLink>
              </div>
            </section>
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
      <section className="dk-report-card" aria-labelledby="operational-heading">
        <div className="dk-report-card-head">
          <h2 id="operational-heading">Operational values</h2>
          <span className="dk-badge dk-badge--neutral text-xs font-mono">ADMIN_SUPER</span>
        </div>
        <p className="dk-card-note" style={{ margin: "0 0 16px 0", fontSize: 13.5, lineHeight: 1.5 }}>
          Only allow-listed operational settings can be modified by super administrators. Every update requires a recorded justification.
        </p>
        <div className="space-y-6">
          {settings.editable.map((setting) => (
            <OperationalSettingForm key={setting.key} setting={setting} />
          ))}
        </div>
      </section>

      <section className="dk-report-card" aria-labelledby="policy-heading">
        <div className="dk-report-card-head">
          <h2 id="policy-heading">Money and release policy</h2>
          <span className="dk-badge dk-badge--neutral text-xs font-mono">Client-owned (D3/D5/D13)</span>
        </div>
        <p className="dk-card-note" style={{ margin: "0 0 16px 0", fontSize: 13.5, lineHeight: 1.5 }}>
          Client-owned decisions shown for operational transparency. Locked from direct modification until an approved policy model is on file.
        </p>
        <dl className="dk-fact-grid">
          {settings.policy.map((item) => (
            <div className="dk-fact" key={item.key}>
              <dt>{item.label}</dt>
              <dd>
                <div style={{ fontWeight: 600, color: "var(--dk-textPrimary)" }}>{item.value}</div>
                <span className="dk-fact-aside" style={{ fontSize: 12, color: "var(--dk-textSecondary)", marginTop: 4 }}>
                  {item.note}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
