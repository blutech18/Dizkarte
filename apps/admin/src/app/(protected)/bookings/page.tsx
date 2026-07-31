import type { Metadata } from "next";
import Link from "next/link";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { BookingRow } from "@/lib/repository/types";
import { StatusFilterBar } from "@/components/ui/StatusFilterBar";
import {
  BOOKING_STATUS_OPTIONS as STATUS_OPTIONS,
  bookingStatusLabel,
  bookingTone,
} from "./status";

export const metadata: Metadata = { title: "Bookings" };

const PAGE_SIZE = 20;

export default async function BookingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const isValidStatus = status && (STATUS_OPTIONS as ReadonlyArray<string>).includes(status);
  const repository = getAdminRepository();
  const result = await repository.listBookings({
    page,
    pageSize: PAGE_SIZE,
    ...(isValidStatus ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<BookingRow>> = [
    {
      key: "task",
      header: "Task",
      render: (row) => <Link href={`/bookings/${row.id}`}>{row.taskTitle}</Link>,
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
      render: (row) => new Date(row.updatedAt).toLocaleString("en-PH"),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (isValidStatus) params.set("status", status);
    params.set("page", String(nextPage));
    return `/bookings?${params.toString()}`;
  }

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
        <StatusFilterBar
          basePath="/bookings"
          options={STATUS_OPTIONS}
          active={isValidStatus ? status : undefined}
          label={bookingStatusLabel}
          allLabel="All bookings"
        />

        {result.items.length === 0 ? (
          <EmptyState
            title="No bookings"
            description="No booking matches this filter. A booking is created when a Client selects an offer."
          />
        ) : (
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
        )}
      </PageSection>
    </>
  );
}
