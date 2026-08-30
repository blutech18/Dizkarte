import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
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
        subtitle="User-submitted reports on tasks, users, messages, offers, and bookings."
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
        <Suspense key={`${active ?? ""}|${page}`} fallback={<TableRegionSkeleton columns={6} />}>
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
      key: "resource",
      header: "Resource",
      render: (row) => `${row.resourceType} · ${row.category}`,
    },
    { key: "reporter", header: "Reporter", render: (row) => row.reporterDisplayName },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={reportStatusTone(row.status)} label={reportStatusLabel(row.status)} />
      ),
    },
    { key: "assignee", header: "Assignee", render: (row) => row.assignee ?? "Unassigned" },
    {
      key: "createdAt",
      header: "Reported",
      render: (row) => <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>,
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink className="dk-btn dk-btn-secondary dk-btn-sm" href={`/reports/${row.id}`}>
          Details
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
        caption="Reports"
        cardTitle={(row) => row.id}
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
