import type { Metadata } from "next";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ReportRow } from "@/lib/repository/types";
import { reportStatusLabel, reportStatusTone } from "./status";

export const metadata: Metadata = { title: "Reports" };

const PAGE_SIZE = 20;

export default async function ReportsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const repository = getAdminRepository();
  const result = await repository.listReports({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
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
      render: (row) => new Date(row.createdAt).toLocaleString("en-PH"),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <a className="dk-btn dk-btn-secondary dk-btn-sm" href={`/reports/${row.id}`}>
          Details
        </a>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }]} />
      <PageSection
        title="Reports"
        subtitle="User-submitted reports on tasks, users, messages, offers, and bookings."
      >
        {result.items.length === 0 ? (
          <EmptyState title="No reports" description="There are no reports matching this filter." />
        ) : (
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
        )}
      </PageSection>
    </>
  );
}
