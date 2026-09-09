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
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { QueueFilters } from "@/components/ui/QueueFilters";
import type { RefundRow } from "@/lib/repository/types";

export const metadata: Metadata = { title: "Refunds" };

const PAGE_SIZE = 20;

const STATUS_OPTIONS = ["REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED"] as const;

const REFUND_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Highest amount" },
  { value: "amount_asc", label: "Lowest amount" },
] as const;

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
 * Provides a comprehensive queue of all refund requests, processing states,
 * and settlements across the platform.
 */
export default async function RefundsPage({
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
  const active = (STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;
  const activeSort = sort && REFUND_SORT_OPTIONS.some((opt) => opt.value === sort) ? sort : undefined;
  const cleanQ = q?.trim() || undefined;
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
          search={{
            label: "Search refunds by booking, payment, or reason",
            placeholder: "Search booking ID, payment ID, reason...",
            value: q?.trim() ?? "",
          }}
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
            {
              name: "sort",
              label: "Sort refunds",
              allLabel: "Newest first",
              value: activeSort,
              options: REFUND_SORT_OPTIONS,
            },
          ]}
        />

        <Suspense
          key={`${active ?? ""}|${cleanQ ?? ""}|${activeSort ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={7} />}
        >
          <RefundsTable
            page={page}
            status={active}
            q={cleanQ}
            sort={activeSort}
          />
        </Suspense>
      </PageSection>
    </>
  );
}

async function RefundsTable({
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
  const result = await getAdminRepository().listRefunds({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(q ? { query: q } : {}),
    ...(sort ? { sort } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<RefundRow>> = [
    {
      key: "booking",
      header: "Booking",
      render: (row) =>
        row.bookingId ? (
          <AppLink
            href={`/bookings/${row.bookingId}`}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
            title={`Booking ${row.bookingId}`}
          >
            {formatReferenceId(row.bookingId, "BK")}
          </AppLink>
        ) : (
          <span className="dk-muted">Not linked</span>
        ),
    },
    {
      key: "paymentIntent",
      header: "Payment",
      render: (row) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <AppLink
            href={`/payments/${row.paymentIntentId}`}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
          >
            {formatReferenceId(row.paymentIntentId, "PAY")}
          </AppLink>
          <CopyButton text={row.paymentIntentId} label="payment ID" variant="icon" />
        </div>
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
      render: (row) => <StatusBadge tone={tone(row.status)} label={label(row.status)} />,
    },
    {
      key: "reason",
      header: "Reason",
      render: (row) => (
        <span style={{ fontSize: 13 }}>{row.reason ?? "No reason recorded"}</span>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      render: (row) => (
        <span style={{ fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
          <time dateTime={row.updatedAt}>{formatDateTime(row.updatedAt)}</time>
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink
          className="dk-btn dk-btn-secondary dk-btn-sm"
          href={`/payments/${row.paymentIntentId}`}
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
        cardTitle={(row) => (
          <span>
            {row.bookingId ? formatReferenceId(row.bookingId, "BK") : "Refund"} · {formatPhp(row.amountCentavos)}
          </span>
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
