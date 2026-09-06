import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import type { AdminCapability } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { getAdminRepository } from "@/lib/repository";
import { percentChange } from "@/lib/repository/dashboard-trends";
import type { DashboardTrendDay } from "@/lib/repository/types";
import { hasAnyCapability } from "@/lib/nav";
import { requireAdminSession } from "@/lib/session";
import { formatDateTime } from "@/lib/datetime";
import { BarChart, type BarChartDatum } from "@/components/ui/BarChart";
import { SkeletonBone } from "@/components/ui/AsyncState";
import { DashboardRefreshButton } from "./DashboardRefreshButton";

export const metadata: Metadata = { title: "Dashboard" };

/** Two weeks: long enough to show a weekly rhythm, short enough to read daily bars. */
const WINDOW_DAYS = 14;

/** Compact peso axis labels: `₱0`, `₱2.5k`, `₱1.2M`. */
function formatPesoAxis(centavos: number): string {
  const pesos = centavos / 100;
  if (pesos >= 1_000_000) return `₱${trimZero(pesos / 1_000_000)}M`;
  if (pesos >= 1_000) return `₱${trimZero(pesos / 1_000)}k`;
  return `₱${trimZero(pesos)}`;
}

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatWholeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function dayLabels(day: DashboardTrendDay): { label: string; axisLabel: string } {
  // Midday avoids any chance of the date shifting when formatted.
  const date = new Date(`${day.date}T12:00:00+08:00`);
  return {
    label: new Intl.DateTimeFormat("en-PH", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Manila",
    }).format(date),
    axisLabel: new Intl.DateTimeFormat("en-PH", {
      day: "numeric",
      timeZone: "Asia/Manila",
    }).format(date),
  };
}

function DeltaNote({
  current,
  previous,
  invert = false,
}: {
  readonly current: number;
  readonly previous: number;
  /** True when a rise is bad news, e.g. failed bookings. */
  readonly invert?: boolean;
}) {
  const change = percentChange(current, previous);
  if (change === null) {
    return <small className="dk-kpi-delta">No prior activity</small>;
  }

  const rounded = Math.round(change);
  const rising = rounded > 0;
  const good = rounded === 0 ? null : invert ? !rising : rising;
  const tone = good === null ? "flat" : good ? "up" : "down";

  return (
    <small className={`dk-kpi-delta dk-kpi-delta-${tone}`}>
      {rounded > 0 ? "+" : ""}
      {rounded}% vs prior {WINDOW_DAYS}d
    </small>
  );
}

function KpiCard({
  label,
  value,
  delta,
}: {
  readonly label: string;
  readonly value: string;
  readonly delta?: React.ReactNode;
}) {
  return (
    <article className="dk-kpi">
      <span className="dk-kpi-label">{label}</span>
      <strong className="dk-kpi-value">{value}</strong>
      {delta}
    </article>
  );
}

type QueueLink = {
  readonly href: string;
  readonly label: string;
  readonly count: number;
  readonly capabilities: ReadonlyArray<AdminCapability>;
};

/**
 * Operations dashboard.
 *
 * The hero — the greeting and the "updated" line — needs only the session the
 * guard has already resolved, so it paints immediately rather than waiting on a
 * query. The two data regions are independent queries and each streams behind
 * its own boundary: the KPI and chart region waits on the trend series, while
 * the "needs attention" queue counts wait on the snapshot. Keeping them as
 * separate sibling boundaries means the two fetches still run in parallel, a
 * slow snapshot never holds back the revenue charts, and neither holds back the
 * greeting.
 */
export default async function DashboardPage() {
  const session = await requireAdminSession();

  const canViewFinance = hasAnyCapability(session.capabilities, ["ADMIN_FINANCE"]);
  const canViewQueues = hasAnyCapability(session.capabilities, ["ADMIN_SUPPORT"]);

  return (
    <section className="dk-dashboard">
      <header className="dk-dashboard-hero">
        <div className="dk-dashboard-hero-copy">
          <div className="dk-dashboard-title-row">
            <h1>Good day, {session.displayName}</h1>
            <span className="dk-dashboard-badge">{WINDOW_DAYS}-day overview</span>
          </div>
        </div>
        <div className="dk-dashboard-hero-actions">
          <span className="dk-dashboard-updated">
            Updated {formatDateTime(new Date().toISOString())} PHT
          </span>
          <DashboardRefreshButton />
        </div>
      </header>

      <Suspense fallback={<DashboardChartsFallback />}>
        <DashboardCharts canViewFinance={canViewFinance} />
      </Suspense>

      <Suspense fallback={<DashboardQueuesFallback />}>
        <DashboardQueues capabilities={session.capabilities} />
      </Suspense>

      {!canViewFinance && !canViewQueues ? (
        <p className="dk-muted">Your current role has no assigned queues or finance scope.</p>
      ) : null}
    </section>
  );
}

async function DashboardCharts({ canViewFinance }: { readonly canViewFinance: boolean }) {
  const trends = await getAdminRepository().getDashboardTrends({ days: WINDOW_DAYS });

  const revenueData: ReadonlyArray<BarChartDatum> = trends.days.map((day) => ({
    ...dayLabels(day),
    values: { fee: day.platformFeeCentavos },
  }));

  const volumeData: ReadonlyArray<BarChartDatum> = trends.days.map((day) => ({
    ...dayLabels(day),
    values: {
      completed: day.bookingsCompleted,
      active: day.bookingsActive,
      failed: day.bookingsFailed,
    },
  }));

  const completedTotal = trends.current.bookingsCompleted;
  const completionRate =
    trends.current.bookingsCreated > 0
      ? (completedTotal / trends.current.bookingsCreated) * 100
      : null;

  return (
    <>
      <div className="dk-kpi-grid">
        {canViewFinance ? (
          <KpiCard
            label="Platform revenue"
            value={formatPhp(trends.current.platformFeeCentavos)}
            delta={
              <DeltaNote
                current={trends.current.platformFeeCentavos}
                previous={trends.previous.platformFeeCentavos}
              />
            }
          />
        ) : null}
        <KpiCard
          label="Marketplace value"
          value={formatPhp(trends.current.grossBookedCentavos)}
          delta={
            <DeltaNote
              current={trends.current.grossBookedCentavos}
              previous={trends.previous.grossBookedCentavos}
            />
          }
        />
        <KpiCard
          label="Completed bookings"
          value={String(completedTotal)}
          delta={
            <DeltaNote current={completedTotal} previous={trends.previous.bookingsCompleted} />
          }
        />
        <KpiCard
          label="Completion rate"
          value={completionRate === null ? "—" : `${Math.round(completionRate)}%`}
          delta={
            <small className="dk-kpi-delta">
              {completedTotal} of {trends.current.bookingsCreated} completed
            </small>
          }
        />
      </div>

      <div className="dk-chart-grid">
        {canViewFinance ? (
          <BarChart
            data={revenueData}
            formatValue={formatPesoAxis}
            id="revenue-chart"
            meta={
              <>
                <strong>{formatPhp(trends.current.platformFeeCentavos)}</strong> total ({WINDOW_DAYS}d)
              </>
            }
            series={[{ key: "fee", label: "Platform fee", tone: "primary" }]}
            summary={`Platform fee per day for the last ${WINDOW_DAYS} days`}
            title="Revenue over time"
          />
        ) : null}

        <BarChart
          data={volumeData}
          formatValue={formatWholeNumber}
          id="volume-chart"
          meta={
            <>
              <strong>{trends.current.bookingsCreated}</strong> total bookings ({WINDOW_DAYS}d)
            </>
          }
          series={[
            { key: "completed", label: "Completed", tone: "success" },
            { key: "active", label: "In progress", tone: "primary" },
            { key: "failed", label: "Cancelled / Failed", tone: "danger" },
          ]}
          summary={`Bookings per day by outcome for the last ${WINDOW_DAYS} days`}
          title="Booking volume & outcomes"
        />
      </div>
    </>
  );
}

async function DashboardQueues({
  capabilities,
}: {
  readonly capabilities: ReadonlyArray<AdminCapability>;
}) {
  const snapshot = await getAdminRepository().getDashboardSnapshot();

  /*
    Queue counts stay on the dashboard because unattended queues are the thing
    that quietly breaks the business, but they sit below the money and volume
    charts as a short list rather than a wall of individual metric cards.
  */
  const allQueues: ReadonlyArray<QueueLink> = [
    {
      href: "/verification",
      label: "Identity verification",
      count: snapshot.pendingVerificationCount,
      capabilities: ["ADMIN_SUPPORT"],
    },
    {
      href: "/taskers",
      label: "Tasker applications",
      count: snapshot.pendingTaskerApplicationCount,
      capabilities: ["ADMIN_SUPPORT"],
    },
    {
      href: "/support",
      label: "Support tickets",
      count: snapshot.openTicketCount,
      capabilities: ["ADMIN_SUPPORT"],
    },
    {
      href: "/reports?status=OPEN",
      label: "User reports",
      count: snapshot.openReportCount,
      capabilities: ["ADMIN_SUPPORT"],
    },
    {
      href: "/bookings",
      label: "Bookings needing attention",
      count: snapshot.attentionBookingCount,
      capabilities: ["ADMIN_SUPPORT"],
    },
    {
      href: "/disputes",
      label: "Open disputes",
      count: snapshot.openDisputeCount,
      capabilities: ["ADMIN_FINANCE"],
    },
    {
      href: "/withdrawals",
      label: "Pending withdrawals",
      count: snapshot.pendingWithdrawalCount,
      capabilities: ["ADMIN_FINANCE"],
    },
    {
      href: "/payments?status=QUARANTINED",
      label: "Quarantined payment events",
      count: snapshot.quarantinedPaymentEventCount,
      capabilities: ["ADMIN_FINANCE"],
    },
  ];

  const queues = allQueues.filter((queue) => hasAnyCapability(capabilities, queue.capabilities));

  return queues.length > 0 ? (
    <section className="dk-dashboard-section" aria-labelledby="dashboard-queues-heading">
      <div className="dk-dashboard-section-heading">
        <h2 id="dashboard-queues-heading">Needs attention now</h2>
      </div>
      <ul className="dk-queue-list">
        {queues.map((queue) => (
          <li key={queue.href}>
            <AppLink href={queue.href}>
              <span className="dk-queue-label">{queue.label}</span>
              <span className={`dk-queue-count ${queue.count === 0 ? "is-clear" : ""}`}>
                {queue.count === 0 ? "Clear" : queue.count}
              </span>
            </AppLink>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}

/*
  Fallbacks reuse the exact dk-kpi-grid / dk-chart-grid / dk-queue-list shapes
  from DashboardSkeleton (the route-level loading.tsx), so the handoff from the
  route skeleton to the streamed shell only fills in the real hero and never
  reshapes the regions underneath it.
*/
function DashboardChartsFallback() {
  return (
    <div role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading business metrics…</span>
      <div className="dk-kpi-grid" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="dk-kpi">
            <SkeletonBone variant="text-sm" style={{ width: "68%" }} />
            <SkeletonBone variant="title" style={{ width: "52%", marginTop: 10 }} />
            <SkeletonBone variant="text-sm" style={{ width: "80%", marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div className="dk-chart-grid" aria-hidden="true">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="dk-chart-card">
            <SkeletonBone variant="title" style={{ width: "46%" }} />
            <SkeletonBone variant="text-sm" style={{ width: "72%", marginTop: 8 }} />
            <SkeletonBone style={{ height: 200, marginTop: 18, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardQueuesFallback() {
  return (
    <div role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading queues…</span>
      <div className="dk-queue-list" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBone key={i} style={{ height: 50, borderRadius: 8 }} />
        ))}
      </div>
    </div>
  );
}
