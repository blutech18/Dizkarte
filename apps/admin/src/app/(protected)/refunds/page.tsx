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
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import type { RefundRow } from "@/lib/repository/types";

export const metadata: Metadata = { title: "Refunds" };

const PAGE_SIZE = 20;

const STATUS_OPTIONS = ["REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED"] as const;

function tone(status: string): BadgeTone {
  switch (status) {
    case "SUCCEEDED":
      return "success";
    case "FAILED":
      return "error";
    case "PROCESSING":
      return "info";
    default:
      return "warning";
  }
}

function label(status: string): string {
  switch (status) {
    case "REQUESTED":
      return "Requested";
    case "PROCESSING":
      return "With provider";
    case "SUCCEEDED":
      return "Refunded";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

/**
 * Refund oversight.
 *
 * Read-only on purpose. A refund is still *started* from the payment it belongs
 * to, because that is where the amount, the booking, and the ledger position are
 * in front of you; starting one from a list would mean deciding without that
 * context. What was missing was the other half — seeing every refund in flight
 * without opening payments one at a time.
 *
 * Provider availability is a configuration fact rather than a query, so the note
 * and the filter row render with the shell immediately. Only the refund listing
 * has to be fetched, so it alone streams in behind a Suspense boundary keyed by
 * the applied filter and page — changing a filter re-shows the skeleton instead
 * of leaving the previous result set on screen.
 */
export default async function RefundsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_FINANCE"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const active = (STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;
  const availability = getAdminRepository().getFinanceProviderAvailability();

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Refunds" }]} />
      <PageSection
        title="Refunds"
        subtitle="Every refund record, newest first. Start a refund from the payment it belongs to, where the booking and ledger position are visible."
      >
        <p className="dk-muted">{availability.reason}</p>

        <QueueFilters
          basePath="/refunds"
          selects={[
            {
              name: "status",
              label: "Filter by refund status",
              allLabel: "All refunds",
              value: active,
              options: STATUS_OPTIONS.map((option) => ({
                value: option,
                label: label(option),
              })),
            },
          ]}
        />

        <Suspense key={`${active ?? ""}|${page}`} fallback={<TableRegionSkeleton columns={6} />}>
          <RefundsTable page={page} status={active} />
        </Suspense>
        <p className="dk-field-description">Signed in as {session.displayName}.</p>
      </PageSection>
    </>
  );
}

async function RefundsTable({
  page,
  status,
}: {
  readonly page: number;
  readonly status: string | undefined;
}) {
  const result = await getAdminRepository().listRefunds({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<RefundRow>> = [
    {
      key: "booking",
      header: "Booking",
      render: (row) =>
        row.bookingId ? (
          <AppLink href={`/bookings/${row.bookingId}`}>{row.bookingId.slice(0, 8)}</AppLink>
        ) : (
          "Not linked"
        ),
    },
    { key: "amount", header: "Amount", render: (row) => formatPhp(row.amountCentavos) },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge tone={tone(row.status)} label={label(row.status)} />,
    },
    { key: "reason", header: "Reason", render: (row) => row.reason ?? "No reason recorded" },
    {
      key: "updated",
      header: "Updated",
      render: (row) => <time dateTime={row.updatedAt}>{formatDateTime(row.updatedAt)}</time>,
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink
          className="dk-btn dk-btn-secondary dk-btn-sm"
          href={`/payments/${row.paymentIntentId}`}
        >
          Open payment
        </AppLink>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/refunds?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState
        title="No refunds"
        description="No refund matches this filter. Refunds are recorded here as soon as one is requested from a payment."
      />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Refunds"
        cardTitle={(row) => formatPhp(row.amountCentavos)}
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
