import type { Metadata } from "next";
import Link from "next/link";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { StatusFilterBar } from "@/components/ui/StatusFilterBar";
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

  const repository = getAdminRepository();
  const [result, availability] = await Promise.all([
    repository.listRefunds({ page, pageSize: PAGE_SIZE, ...(active ? { status: active } : {}) }),
    repository.getFinanceProviderAvailability(),
  ]);

  const columns: ReadonlyArray<ColumnDef<RefundRow>> = [
    {
      key: "booking",
      header: "Booking",
      render: (row) =>
        row.bookingId ? (
          <Link href={`/bookings/${row.bookingId}`}>{row.bookingId.slice(0, 8)}</Link>
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
      render: (row) => new Date(row.updatedAt).toLocaleString("en-PH"),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <a className="dk-btn dk-btn-secondary dk-btn-sm" href={`/payments/${row.paymentIntentId}`}>
          Open payment
        </a>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (active) params.set("status", active);
    params.set("page", String(nextPage));
    return `/refunds?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Refunds" }]} />
      <PageSection
        title="Refunds"
        subtitle="Every refund record, newest first. Start a refund from the payment it belongs to, where the booking and ledger position are visible."
      >
        <p className="dk-muted">{availability.reason}</p>

        <StatusFilterBar
          basePath="/refunds"
          options={STATUS_OPTIONS}
          active={active}
          label={label}
          allLabel="All refunds"
        />

        {result.items.length === 0 ? (
          <EmptyState
            title="No refunds"
            description="No refund matches this filter. Refunds are recorded here as soon as one is requested from a payment."
          />
        ) : (
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
        )}
        <p className="dk-field-description">Signed in as {session.displayName}.</p>
      </PageSection>
    </>
  );
}
