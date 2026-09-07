import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDate, formatTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { BookingRow } from "@/lib/repository/types";
import { QueueFilters } from "@/components/ui/QueueFilters";
import {
  BOOKING_STATUS_OPTIONS as STATUS_OPTIONS,
  bookingStatusLabel,
  bookingTone,
} from "./status";

export const metadata: Metadata = { title: "Bookings" };

const PAGE_SIZE = 20;

export const SORT_OPTIONS = [
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Recently updated" },
  { value: "amount_high", label: "Highest agreed amount" },
  { value: "amount_low", label: "Lowest agreed amount" },
] as const;

type BookingsQuery = {
  readonly page: number;
  readonly status: string | undefined;
  readonly q: string | undefined;
  readonly sort: string | undefined;
};

/**
 * Bookings queue.
 *
 * The shell — breadcrumbs, heading, and the filter row — depends on no query,
 * so it is returned immediately and the results table streams in behind its own
 * Suspense boundary. Awaiting the query here would hold back controls the operator
 * can already read and use.
 *
 * The boundary is keyed by the applied filters and page so changing a filter
 * shows the skeleton again rather than leaving the previous result set on screen
 * looking like the answer to the new query.
 */
export default async function BookingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    status?: string;
    q?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, q, sort, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const isValidStatus = status && (STATUS_OPTIONS as ReadonlyArray<string>).includes(status);
  const activeStatus = isValidStatus ? status : undefined;
  const isValidSort = sort && SORT_OPTIONS.some((opt) => opt.value === sort);
  const activeSort = isValidSort ? sort : undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Bookings" }]} />
      <PageSection
        title="Bookings"
        subtitle="Marketplace workflow oversight. Agreed amounts and participant names only — never contact details, the exact address, or chat contents."
      >
        <QueueFilters
          basePath="/bookings"
          search={{
            label: "Search bookings by reference, task, client, or tasker",
            placeholder: "Search reference, task, client, or tasker...",
            value: q?.trim() ?? "",
          }}
          selects={[
            {
              name: "status",
              label: "Filter by booking status",
              allLabel: "All bookings",
              value: activeStatus,
              options: STATUS_OPTIONS.map((option) => ({
                value: option,
                label: bookingStatusLabel(option),
              })),
            },
            {
              name: "sort",
              label: "Sort bookings",
              allLabel: "Newest first",
              value: activeSort,
              options: SORT_OPTIONS,
            },
          ]}
        />

        <Suspense
          key={`${activeStatus ?? ""}|${q?.trim() ?? ""}|${activeSort ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={6} />}
        >
          <BookingsTable
            page={page}
            status={activeStatus}
            q={q?.trim() || undefined}
            sort={activeSort}
          />
        </Suspense>
      </PageSection>
    </>
  );
}

async function BookingsTable({ page, status, q, sort }: BookingsQuery) {
  const repository = getAdminRepository();
  const result = await repository.listBookings({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(q ? { query: q } : {}),
    ...(sort ? { sort } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<BookingRow>> = [
    {
      key: "task",
      header: "Task",
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "left" }}>
          <AppLink
            href={`/bookings/${row.id}`}
            style={{ fontWeight: 650, color: "var(--dk-textPrimary)" }}
          >
            {row.taskTitle}
          </AppLink>
          <span className="dk-ref-code" style={{ fontSize: 11 }} title={row.id}>
            {formatReferenceId(row.id, "BK", row.createdAt)}
          </span>
        </div>
      ),
    },
    {
      key: "participants",
      header: "Client / Tasker",
      render: (row) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 500, color: "var(--dk-textPrimary)" }}>
            {row.clientDisplayName}
          </span>
          <span style={{ color: "var(--dk-textMuted)", fontSize: 12 }} aria-hidden="true">
            →
          </span>
          <span style={{ color: "var(--dk-textSecondary)" }}>{row.taskerDisplayName}</span>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Agreed",
      render: (row) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {formatPhp(row.agreedCentavos)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={bookingTone(row.status)} label={bookingStatusLabel(row.status)} />
      ),
    },
    {
      key: "updated",
      header: "Updated",
      render: (row) => (
        <time dateTime={row.updatedAt} title={row.updatedAt} className="dk-datetime-cell">
          <span className="dk-datetime-date">{formatDate(row.updatedAt)}</span>
          <span className="dk-datetime-time">{formatTime(row.updatedAt)}</span>
        </time>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink
          href={`/bookings/${row.id}`}
          className="dk-btn dk-btn-secondary"
          style={{
            padding: "4px 10px",
            fontSize: 12,
            height: "auto",
            minHeight: 28,
            textDecoration: "none",
          }}
        >
          View
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
    return `/bookings?${params.toString()}`;
  }

  if (result.items.length === 0) {
    const hasFilters = Boolean(status || q || sort);
    return (
      <EmptyState
        title={hasFilters ? "No matching bookings" : "No bookings"}
        description={
          hasFilters
            ? "No bookings match your active filters. Try clearing your search query or status filter."
            : "No bookings recorded yet. A booking is created when a Client selects an offer."
        }
      />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Bookings"
        cardTitle={(row) => row.taskTitle}
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
