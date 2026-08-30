import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
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

type BookingsQuery = {
  readonly page: number;
  readonly status: string | undefined;
};

/**
 * Bookings queue.
 *
 * The shell — breadcrumbs, heading, and the status filter — depends on no query,
 * so it is returned immediately and the results table streams in behind its own
 * Suspense boundary. Awaiting the query here would hold back controls the agent
 * can already read and use.
 *
 * The boundary is keyed by the applied status and page so changing a filter
 * shows the skeleton again rather than leaving the previous result set on screen
 * looking like the answer to the new query.
 */
export default async function BookingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const isValidStatus = status && (STATUS_OPTIONS as ReadonlyArray<string>).includes(status);
  const activeStatus = isValidStatus ? status : undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Bookings" }]} />
      <PageSection
        title="Bookings"
        subtitle="Marketplace workflow oversight. Agreed amounts and participant names only — never contact details, the exact address, or chat contents."
      >
        {/*
          "Completed work" is this page filtered to COMPLETED rather than a
          separate route. A second screen over the same table would duplicate the
          columns and split the agent's attention for no gain.
        */}
        <QueueFilters
          basePath="/bookings"
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
          ]}
        />

        <Suspense
          key={`${activeStatus ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={5} />}
        >
          <BookingsTable page={page} status={activeStatus} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function BookingsTable({ page, status }: BookingsQuery) {
  const repository = getAdminRepository();
  const result = await repository.listBookings({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<BookingRow>> = [
    {
      key: "task",
      header: "Task",
      render: (row) => <AppLink href={`/bookings/${row.id}`}>{row.taskTitle}</AppLink>,
    },
    {
      key: "participants",
      header: "Client / Tasker",
      render: (row) => `${row.clientDisplayName} → ${row.taskerDisplayName}`,
    },
    { key: "amount", header: "Agreed", render: (row) => formatPhp(row.agreedCentavos) },
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
      render: (row) => <time dateTime={row.updatedAt}>{formatDateTime(row.updatedAt)}</time>,
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/bookings?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState
        title="No bookings"
        description="No booking matches this filter. A booking is created when a Client selects an offer."
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
