import type { Metadata } from "next";
import { requirePageCapability } from "@/lib/guard";
import { loadServerConfig } from "@/lib/config";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePageCapability(["ADMIN_SUPER"]);
  const config = loadServerConfig();

  const rows: ReadonlyArray<{ label: string; mode: string }> = [
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
        subtitle="Safe operational metadata only. No secrets are ever rendered in this UI."
      >
        <div className="dk-card">
          <h2 style={{ marginTop: 0 }}>Environment</h2>
          <p>
            <strong>Environment:</strong> {config.environment}
          </p>
          <h3>Adapter modes</h3>
          <ul>
            {rows.map((row) => (
              <li key={row.label}>
                {row.label}:{" "}
                <StatusBadge
                  tone={
                    row.mode === "synthetic" ? "warning" : row.mode === "live" ? "success" : "info"
                  }
                  label={row.mode}
                />
              </li>
            ))}
          </ul>
        </div>
      </PageSection>
    </>
  );
}
