import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePageCapability } from "@/lib/guard";
import { loadServerConfig } from "@/lib/config";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection } from "@/components/ui/Pagination";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
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
 * Operational settings.
 *
 * One page heading, with each concern as a section beneath it. The page
 * previously stacked three `PageSection`s, each of which renders an `h1`, so a
 * screen reader announced three page titles on one screen — and the environment
 * card repeated its own section heading immediately below it.
 *
 * The environment panel reads only synchronous server config, so it paints
 * immediately. The editable values and the money/release policy are two views of
 * one `getSettings()` read and share a single Suspense boundary.
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
        subtitle="Editable operational values, the money and release policy, and safe deployment metadata. No secret is ever rendered here."
      >
        <div className="dk-detail">
          <Suspense fallback={<DetailRegionSkeleton cards={2} lines={3} />}>
            <ManagedSettings />
          </Suspense>

          <section className="dk-card" aria-labelledby="environment-heading">
            <h2 id="environment-heading">Environment</h2>
            <dl className="dk-fact-grid">
              <div className="dk-fact">
                <dt>Deployment environment</dt>
                <dd>{config.environment}</dd>
              </div>
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
        </div>
      </PageSection>
    </>
  );
}

async function ManagedSettings() {
  const settings = await getAdminRepository().getSettings();

  return (
    <>
      <section className="dk-card" aria-labelledby="operational-heading">
        <h2 id="operational-heading">Operational values</h2>
        <p className="dk-card-note">Every change is recorded in the audit log.</p>
        {settings.editable.map((setting) => (
          <OperationalSettingForm key={setting.key} setting={setting} />
        ))}
      </section>

      <section className="dk-card" aria-labelledby="policy-heading">
        <h2 id="policy-heading">Money and release policy</h2>
        <p className="dk-card-note">
          Client-owned decisions, shown for transparency. Not editable from the console until an
          approved policy is on file.
        </p>
        <dl className="dk-fact-grid">
          {settings.policy.map((item) => (
            <div className="dk-fact" key={item.key}>
              <dt>{item.label}</dt>
              <dd>
                {item.value}
                <span className="dk-fact-aside">{item.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
