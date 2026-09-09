import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
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

const DISPUTE_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Highest amount" },
  { value: "amount_asc", label: "Lowest amount" },
] as const;

/**
 * Disputes queue.
 *
 * The shell — breadcrumbs, heading, and the signed-in line — needs no query, so
 * it is returned immediately and the results table streams in behind its own
 * Suspense boundary. Awaiting the list here instead would hold back chrome the
 * operator can already read while the slowest query runs.
 *
 * The boundary is keyed by the status filter, search query, sort, and page number
 * so navigating re-shows the skeleton rather than leaving the previous result set
 * on screen looking like the answer to the new query.
 */
export default async function DisputesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    status?: string;
    q?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  await requirePageCapability(["ADMIN_FINANCE"]);
  const { status, q, sort, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const activeStatus = status
    ? DISPUTE_STATUS_OPTIONS.find((s) => s.toLowerCase() === status.toLowerCase())
    : undefined;
  const activeSort = sort && DISPUTE_SORT_OPTIONS.some((opt) => opt.value === sort) ? sort : undefined;
  const cleanQ = q?.trim() || undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Disputes" }]} />
      <PageSection
        title="Disputes"
        subtitle="Freezing affected financial activity never rewrites ledger history. Amounts shown are booking totals, not raw provider payloads."
      >
        <QueueFilters
          basePath="/disputes"
          search={{
            label: "Search disputes by reference, booking, or assignee",
            placeholder: "Search reference, booking ID, assignee...",
            value: q?.trim() ?? "",
          }}
          selects={[
            {
              name: "status",
              label: "Filter by dispute status",
              allLabel: "All disputes",
              value: activeStatus,
              options: DISPUTE_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: disputeStatusLabel(option),
              })),
            },
            {
              name: "sort",
              label: "Sort disputes",
              allLabel: "Newest first",
              value: activeSort,
              options: DISPUTE_SORT_OPTIONS,
            },
          ]}
        />
        <Suspense
          key={`${activeStatus ?? ""}|${cleanQ ?? ""}|${activeSort ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={7} />}
        >
          <DisputesTable
            page={page}
            status={activeStatus}
            q={cleanQ}
            sort={activeSort}
          />
        </Suspense>
      </PageSection>
    </>
  );
}

async function DisputesTable({
  page,
  status,
  q,
  sort,
}: {
  readonly page: number;
  readonly status: string | undefined;
  readonly q: string | undefined;
  readonly sort: string | undefined;
}) {
  const repository = getAdminRepository();
  const result = await repository.listDisputes({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(q ? { query: q } : {}),
    ...(sort ? { sort } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<DisputeRow>> = [
    {
      key: "reference",
      header: "Dispute",
      render: (row) => (
        <AppLink
          href={`/disputes/${row.id}`}
          style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, fontSize: 13 }}
        >
          {formatReferenceId(row.id, "DSP", row.openedAt)}
        </AppLink>
      ),
    },
    {
      key: "booking",
      header: "Booking",
      showInCard: false,
      render: (row) => (
        <AppLink
          href={`/bookings/${row.bookingId}`}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
          title={`Booking ${row.bookingId}`}
        >
          {formatReferenceId(row.bookingId, "BK")}
        </AppLink>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => (
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {formatPhp(row.amountCentavos)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={disputeStatusTone(row.status)} label={disputeStatusLabel(row.status)} />
      ),
    },
    {
      key: "opened",
      header: "Opened",
      render: (row) => (
        <span style={{ fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
          <time dateTime={row.openedAt}>{formatDateTime(row.openedAt)}</time>
        </span>
      ),
    },
    {
      key: "assignee",
      header: "Assignee",
      render: (row) => (
        row.assignee ? (
          <span style={{ fontSize: 13, fontWeight: 500 }}>{row.assignee}</span>
        ) : (
          <span className="dk-muted" style={{ fontSize: 12.5 }}>Unassigned</span>
        )
      ),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink
          href={`/disputes/${row.id}`}
          className="dk-btn dk-btn-secondary dk-btn-sm"
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          Review
        </AppLink>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
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
        cardTitle={(row) => (
          <AppLink href={`/disputes/${row.id}`}>
            {formatReferenceId(row.id, "DSP", row.openedAt)} · {formatPhp(row.amountCentavos)}
          </AppLink>
        )}
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

