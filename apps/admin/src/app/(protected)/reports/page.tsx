import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDate, formatTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ReportRow } from "@/lib/repository/types";
import { REPORT_STATUS_OPTIONS, reportStatusLabel, reportStatusTone } from "./status";

export const metadata: Metadata = { title: "Reports" };

const PAGE_SIZE = 20;

function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function resourceBadgeStyle(type: string): { bg: string; color: string; border: string } {
  switch (type.toLowerCase()) {
    case "task":
      return {
        bg: "rgba(110, 32, 223, 0.08)",
        color: "var(--dk-primary)",
        border: "rgba(110, 32, 223, 0.2)",
      };
    case "user":
      return {
        bg: "rgba(30, 144, 255, 0.08)",
        color: "#1e90ff",
        border: "rgba(30, 144, 255, 0.2)",
      };
    case "booking":
      return {
        bg: "rgba(16, 185, 129, 0.08)",
        color: "#059669",
        border: "rgba(16, 185, 129, 0.2)",
      };
    case "message":
      return {
        bg: "rgba(245, 158, 11, 0.08)",
        color: "#d97706",
        border: "rgba(245, 158, 11, 0.2)",
      };
    default:
      return {
        bg: "var(--dk-bg-subtle, rgba(0, 0, 0, 0.04))",
        color: "var(--dk-textSecondary)",
        border: "var(--dk-borderSubtle)",
      };
  }
}

function formatLabel(val: string): string {
  return val.replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

/**
 * Reports queue.
 *
 * The shell — breadcrumbs and heading — needs no query, so it is returned
 * immediately and the results table streams in behind its own Suspense boundary.
 * Awaiting the list here instead would hold back chrome the operator can already
 * read while the slowest query runs.
 *
 * The boundary is keyed by the status filter and page number so navigating
 * re-shows the skeleton rather than leaving the previous result set on screen
 * looking like the answer to the new query.
 */
export default async function ReportsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  // An unrecognised value must not reach the query as a filter nobody can clear.
  const active = (REPORT_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }]} />
      <PageSection
        title="Reports"
        subtitle="User-submitted reports on tasks, users, messages, offers, and bookings requiring moderation oversight."
      >
        <QueueFilters
          basePath="/reports"
          selects={[
            {
              name: "status",
              label: "Filter by report status",
              allLabel: "All reports",
              value: active,
              options: REPORT_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: reportStatusLabel(option),
              })),
            },
          ]}
        />
        <Suspense key={`${active ?? ""}|${page}`} fallback={<TableRegionSkeleton columns={7} />}>
          <ReportsTable page={page} status={active} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function ReportsTable({
  page,
  status,
}: {
  readonly page: number;
  readonly status: string | undefined;
}) {
  const active = (REPORT_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;
  const repository = getAdminRepository();
  const result = await repository.listReports({
    page,
    pageSize: PAGE_SIZE,
    ...(active ? { status: active } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<ReportRow>> = [
    {
      key: "report",
      header: "Report Ref",
      render: (row) => {
        const formattedRef = formatReferenceId(row.id, "RPT", row.createdAt);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "left" }}>
            <AppLink
              href={`/reports/${row.id}`}
              style={{ fontWeight: 650, color: "var(--dk-textPrimary)" }}
            >
              {formattedRef}
            </AppLink>
            <span
              className="dk-ref-code"
              style={{ fontSize: 11, color: "var(--dk-textMuted)" }}
              title={row.id}
            >
              {row.id}
            </span>
          </div>
        );
      },
    },
    {
      key: "resource",
      header: "Subject & Category",
      render: (row) => {
        const badge = resourceBadgeStyle(row.resourceType);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "1px 6px",
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderRadius: "var(--dk-radius-sm)",
                  background: badge.bg,
                  color: badge.color,
                  border: `1px solid ${badge.border}`,
                  lineHeight: 1.4,
                }}
              >
                {formatLabel(row.resourceType)}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dk-textPrimary)" }}>
                {formatLabel(row.category)}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: "reporter",
      header: "Reporter",
      render: (row) => {
        const isProtected = row.reporterDisplayName === "(protected)";
        return isProtected ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12.5,
              color: "var(--dk-textMuted)",
            }}
            title="Reporter identity is protected by support policy"
          >
            <ShieldIcon />
            <span>Protected identity</span>
          </span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--dk-textPrimary)" }}>
            {row.reporterDisplayName}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={reportStatusTone(row.status)} label={reportStatusLabel(row.status)} />
      ),
    },
    {
      key: "assignee",
      header: "Assignee",
      render: (row) =>
        row.assignee ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "rgba(110, 32, 223, 0.12)",
                color: "var(--dk-primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10.5,
                fontWeight: 700,
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              {row.assignee.charAt(0).toUpperCase()}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{row.assignee}</span>
          </div>
        ) : (
          <span
            style={{
              fontSize: 11.5,
              color: "var(--dk-textMuted)",
              background: "var(--dk-bg-subtle, rgba(0, 0, 0, 0.02))",
              padding: "2px 7px",
              borderRadius: "var(--dk-radius-sm)",
              border: "1px dashed var(--dk-borderSubtle)",
            }}
          >
            Unassigned
          </span>
        ),
    },
    {
      key: "createdAt",
      header: "Reported",
      render: (row) => (
        <time dateTime={row.createdAt} className="dk-datetime-cell">
          <span className="dk-datetime-date">{formatDate(row.createdAt)}</span>
          <span className="dk-datetime-time">{formatTime(row.createdAt)}</span>
        </time>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink
          className="dk-btn dk-btn-secondary dk-btn-sm"
          href={`/reports/${row.id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span>Review</span>
          <ArrowRightIcon />
        </AppLink>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (active) params.set("status", active);
    params.set("page", String(nextPage));
    return `/reports?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState title="No reports" description="There are no reports matching this filter." />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Reports queue"
        cardTitle={(row) => formatReferenceId(row.id, "RPT", row.createdAt)}
      />
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        hasMore={result.hasMore}
        makeHref={hrefFor}
      />
    </>
  );
}
