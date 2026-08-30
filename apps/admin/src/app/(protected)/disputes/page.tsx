import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import type { DisputeRow } from "@/lib/repository/types";
import { DISPUTE_STATUS_OPTIONS, disputeStatusLabel, disputeStatusTone } from "./status";

export const metadata: Metadata = { title: "Disputes" };

const PAGE_SIZE = 20;

/**
 * Disputes queue.
 *
 * The shell — breadcrumbs, heading, and the signed-in line — needs no query, so
 * it is returned immediately and the results table streams in behind its own
 * Suspense boundary. Awaiting the list here instead would hold back chrome the
 * operator can already read while the slowest query runs.
 *
 * The boundary is keyed by the status filter and page number so navigating
 * re-shows the skeleton rather than leaving the previous result set on screen
 * looking like the answer to the new query.
 */
export default async function DisputesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_FINANCE"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  // An unrecognised value must not reach the query as a filter nobody can clear.
  const active = (DISPUTE_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Disputes" }]} />
      <PageSection
        title="Disputes"
        subtitle="Freezing affected financial activity never rewrites ledger history. Amounts shown are booking totals, not raw provider payloads."
      >
        <QueueFilters
          basePath="/disputes"
          selects={[
            {
              name: "status",
              label: "Filter by dispute status",
              allLabel: "All disputes",
              value: active,
              options: DISPUTE_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: disputeStatusLabel(option),
              })),
            },
          ]}
        />
        <Suspense key={`${active ?? ""}|${page}`} fallback={<TableRegionSkeleton columns={4} />}>
          <DisputesTable page={page} status={active} />
        </Suspense>
        <p className="dk-field-description">Signed in as {session.displayName}.</p>
      </PageSection>
    </>
  );
}

async function DisputesTable({
  page,
  status,
}: {
  readonly page: number;
  readonly status: string | undefined;
}) {
  const repository = getAdminRepository();
  const result = await repository.listDisputes({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<DisputeRow>> = [
    {
      key: "booking",
      header: "Booking",
      // The card view links the same id as its title.
      showInCard: false,
      render: (row) => <AppLink href={`/disputes/${row.id}`}>{row.bookingId}</AppLink>,
    },
    { key: "amount", header: "Amount", render: (row) => formatPhp(row.amountCentavos) },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={disputeStatusTone(row.status)} label={disputeStatusLabel(row.status)} />
      ),
    },
    {
      key: "assignee",
      header: "Assignee",
      render: (row) => row.assignee ?? <span className="dk-muted">Unassigned</span>,
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/disputes?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState title="No disputes" description="No dispute matches this filter right now." />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Disputes"
        cardTitle={(row) => <AppLink href={`/disputes/${row.id}`}>{row.bookingId}</AppLink>}
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
