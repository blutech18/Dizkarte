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
 * Clean, balanced workstation layout:
 *  - Column 1: Editable operational parameters and client-owned policies (D3/D5/D13).
 *  - Column 2: Runtime deployment metadata, external service adapters, and audit trail links.
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
        subtitle="Platform configuration, operational parameters, governance policies, and deployment environment."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 20, alignItems: "start" }}>
          {/* Column 1: Operational Settings & Governance Policies */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Suspense fallback={<DetailRegionSkeleton cards={2} lines={3} />}>
              <ManagedSettings />
            </Suspense>
          </div>

          {/* Column 2: Runtime Environment & Security */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Runtime Environment Card */}
            <section
              style={{
                background: "var(--dk-surface)",
                border: "1px solid var(--dk-borderSubtle)",
                borderRadius: "var(--dk-radius-md)",
                padding: "20px 22px",
              }}
              aria-labelledby="environment-heading"
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--dk-borderSubtle)" }}>
                <div>
                  <h2 id="environment-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--dk-textPrimary)" }}>
                    Runtime environment
                  </h2>
                  <p style={{ margin: "3px 0 0 0", fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
                    Active deployment tier and external service adapters
                  </p>
                </div>
                <StatusBadge
                  tone={config.environment === "production" ? "success" : "info"}
                  label={config.environment.toUpperCase()}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {adapters.map((adapter) => (
                  <div
                    key={adapter.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "var(--dk-surfaceSubtle)",
                      borderRadius: "var(--dk-radius-sm)",
                      border: "1px solid var(--dk-borderSubtle)",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dk-textPrimary)" }}>
                      {adapter.label}
                    </span>
                    <StatusBadge
                      tone={adapterModeTone(adapter.mode)}
                      label={adapterModeLabel(adapter.mode)}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Security & Audit Policy Card */}
            <section
              style={{
                background: "var(--dk-surface)",
                border: "1px solid var(--dk-borderSubtle)",
                borderRadius: "var(--dk-radius-md)",
                padding: "20px 22px",
              }}
              aria-labelledby="security-heading"
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--dk-borderSubtle)" }}>
                <div>
                  <h2 id="security-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--dk-textPrimary)" }}>
                    Security & audit policy
                  </h2>
                  <p style={{ margin: "3px 0 0 0", fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
                    Governance and compliance auditing rules
                  </p>
                </div>
                <span
                  className="dk-badge dk-badge--neutral"
                  style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, fontWeight: 600 }}
                >
                  ADMIN_SUPER
                </span>
              </div>
              <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--dk-textSecondary)", lineHeight: 1.55 }}>
                Modifications to operational values require super-admin credentials and are executed through
                capability-scoped RPCs. Every configuration mutation generates an immutable, timestamped audit log entry
                with operator justification.
              </p>
              <div>
                <AppLink
                  href="/audit?action=setting.update"
                  className="dk-btn dk-btn-secondary"
                  style={{ fontSize: 12.5, padding: "7px 14px" }}
                >
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
      {/* Operational Settings Card */}
      <section
        style={{
          background: "var(--dk-surface)",
          border: "1px solid var(--dk-borderSubtle)",
          borderRadius: "var(--dk-radius-md)",
          padding: "20px 22px",
        }}
        aria-labelledby="operational-heading"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--dk-borderSubtle)" }}>
          <div>
            <h2 id="operational-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--dk-textPrimary)" }}>
              Operational values
            </h2>
            <p style={{ margin: "3px 0 0 0", fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
              Dynamic platform thresholds editable by super administrators
            </p>
          </div>
          <span
            className="dk-badge dk-badge--neutral"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, fontWeight: 600 }}
          >
            ADMIN_SUPER
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {settings.editable.map((setting) => (
            <OperationalSettingForm key={setting.key} setting={setting} />
          ))}
        </div>
      </section>

      {/* Policy Card */}
      <section
        style={{
          background: "var(--dk-surface)",
          border: "1px solid var(--dk-borderSubtle)",
          borderRadius: "var(--dk-radius-md)",
          padding: "20px 22px",
        }}
        aria-labelledby="policy-heading"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--dk-borderSubtle)" }}>
          <div>
            <h2 id="policy-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--dk-textPrimary)" }}>
              Money and release policy
            </h2>
            <p style={{ margin: "3px 0 0 0", fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
              Client-owned marketplace rules governed by off-chain legal contracts
            </p>
          </div>
          <span
            className="dk-badge dk-badge--neutral"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, fontWeight: 600 }}
          >
            Client-owned (D3/D5/D13)
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {settings.policy.map((item) => (
            <div
              key={item.key}
              style={{
                background: "var(--dk-surfaceSubtle)",
                border: "1px solid var(--dk-borderSubtle)",
                borderRadius: "var(--dk-radius-sm)",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dk-textPrimary)" }}>
                  {item.label}
                </span>
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: "var(--dk-textPrimary)",
                    background: "var(--dk-surface)",
                    padding: "2px 8px",
                    borderRadius: "var(--dk-radius-sm)",
                    border: "1px solid var(--dk-borderSubtle)",
                  }}
                >
                  {item.value}
                </span>
              </div>
              <span style={{ fontSize: 12, color: "var(--dk-textSecondary)", lineHeight: 1.45 }}>
                {item.note}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
