import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp, formatPhpSigned } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import {
  paymentStatusLabel,
  paymentStatusTone,
  providerEventStatusLabel,
  providerEventStatusTone,
  PAYMENT_STATUS_OPTIONS,
} from "./status";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton, SkeletonBone } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import type { PaymentIntentRow, ProviderEventRow, PaymentIntentStatus } from "@/lib/repository/types";

export const metadata: Metadata = { title: "Payments & ledger" };

const PAGE_SIZE = 20;

const PAYMENT_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Highest amount" },
  { value: "amount_asc", label: "Lowest amount" },
] as const;

/**
 * Payments & ledger.
 *
 * The ledger overview provides real-time totals computed from immutable ledger transactions.
 * Payment records and provider events stream under dedicated Suspense boundaries
 * with multi-criteria search, status, and sorting filters.
 */
export default async function PaymentsPage({
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
  const activeStatus = (PAYMENT_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? (status as PaymentIntentStatus)
    : undefined;
  const activeSort = sort && PAYMENT_SORT_OPTIONS.some((opt) => opt.value === sort) ? sort : undefined;
  const cleanQ = q?.trim() || undefined;

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Payments & ledger" }]}
      />
      <Suspense fallback={<PaymentsLedgerFallback />}>
        <PaymentsLedgerSection
          page={page}
          status={activeStatus}
          q={cleanQ}
          sort={activeSort}
        />
      </Suspense>
    </>
  );
}

async function PaymentsLedgerSection({
  page,
  status,
  q,
  sort,
}: {
  readonly page: number;
  readonly status: PaymentIntentStatus | undefined;
  readonly q: string | undefined;
  readonly sort: string | undefined;
}) {
  const repository = getAdminRepository();
  const [summary, availability] = await Promise.all([
    repository.getFinanceSummary(),
    repository.getFinanceProviderAvailability(),
  ]);

  return (
    <PageSection
      title="Payments & ledger"
      subtitle={
        summary.synthetic
          ? "Development synthetic projection derived from a balanced append-only synthetic ledger. Provider payloads and secrets are never rendered."
          : "Derived from the balanced append-only Supabase ledger. Totals are computed from ledger transactions, never from a mutable balance column. Provider payloads and secrets are never rendered."
      }
    >
      <div className="dk-card" style={{ marginBottom: 16 }}>
        <StatusBadge tone="warning" label="Live provider actions unavailable" />
        <p className="dk-muted" style={{ marginTop: 8, marginBottom: 0 }}>
          {availability.reason}
        </p>
      </div>

      <div className="dk-summary-grid" role="group" aria-label="Finance summary">
        <SummaryCard
          label="Protected"
          value={formatPhpSigned(summary.protectedCentavos)}
          hint="Held in escrow"
        />
        <SummaryCard
          label="Captured"
          value={formatPhpSigned(summary.capturedCentavos)}
          hint="Client funded"
        />
        <SummaryCard
          label="Released"
          value={formatPhpSigned(summary.releasedCentavos)}
          hint="Paid to taskers"
        />
        <SummaryCard
          label="Refunded"
          value={formatPhpSigned(summary.refundedCentavos)}
          hint="Returned to clients"
        />
        <SummaryCard
          label="Platform fee"
          value={formatPhpSigned(summary.platformFeeCentavos)}
          hint={`${(summary.platformFeeBps / 100).toFixed(2)}% take rate`}
        />
        <SummaryCard
          label="Ledger balance"
          value={formatPhpSigned(summary.ledgerBalanceCentavos)}
          hint={summary.ledgerBalanceCentavos === 0 ? "Balanced" : "Needs review"}
        />
      </div>
      <p className="dk-field-description" style={{ marginBottom: 24 }}>
        {summary.synthetic
          ? "DEVELOPMENT SYNTHETIC projection — totals are derived from balanced ledger transactions, not a mutable balance field."
          : "Totals are derived from balanced ledger transactions, not a mutable balance field. A non-zero ledger balance is itself a reconciliation signal."}
      </p>

      <h2>Payment records</h2>
      <QueueFilters
        basePath="/payments"
        search={{
          label: "Search payments by reference, booking, or amount",
          placeholder: "Search payment ID, booking ID...",
          value: q ?? "",
        }}
        selects={[
          {
            name: "status",
            label: "Filter by payment status",
            allLabel: "All statuses",
            value: status,
            options: PAYMENT_STATUS_OPTIONS.map((opt) => ({
              value: opt,
              label: paymentStatusLabel(opt),
            })),
          },
          {
            name: "sort",
            label: "Sort payments",
            allLabel: "Newest first",
            value: sort,
            options: PAYMENT_SORT_OPTIONS,
          },
        ]}
      />
      <Suspense
        key={`${status ?? ""}|${q ?? ""}|${sort ?? ""}|${page}`}
        fallback={<TableRegionSkeleton columns={7} />}
      >
        <PaymentIntentsTable
          page={page}
          status={status}
          q={q}
          sort={sort}
        />
      </Suspense>

      <h2 style={{ marginTop: 32 }}>Provider events</h2>
      <p className="dk-muted">
        Reference metadata only — never a raw provider payload, signature, or secret.
      </p>
      <Suspense fallback={<TableRegionSkeleton columns={6} />}>
        <ProviderEventsTable />
      </Suspense>
    </PageSection>
  );
}

async function PaymentIntentsTable({
  page,
  status,
  q,
  sort,
}: {
  readonly page: number;
  readonly status: PaymentIntentStatus | undefined;
  readonly q: string | undefined;
  readonly sort: string | undefined;
}) {
  const intentsPage = await getAdminRepository().listPaymentIntents({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(q ? { query: q } : {}),
    ...(sort ? { sort } : {}),
  });

  const intentColumns: ReadonlyArray<ColumnDef<PaymentIntentRow>> = [
    {
      key: "reference",
      header: "Payment",
      render: (row) => (
        <AppLink
          href={`/payments/${row.id}`}
          style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, fontSize: 13 }}
        >
          {formatReferenceId(row.id, "PAY", row.createdAt)}
        </AppLink>
      ),
    },
    {
      key: "booking",
      header: "Booking",
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
      key: "fee",
      header: "Platform fee",
      render: (row) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatPhp(row.platformFeeCentavos)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={paymentStatusTone(row.status)} label={paymentStatusLabel(row.status)} />
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (row) => (
        <span style={{ fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
          <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
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
          href={`/payments/${row.id}`}
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
    return `/payments?${params.toString()}`;
  }

  if (intentsPage.items.length === 0) {
    return (
      <EmptyState title="No payment records" description="There are no payment intents matching this filter." />
    );
  }

  return (
    <>
      <RecordList
        rows={intentsPage.items}
        columns={intentColumns}
        getRowKey={(row) => row.id}
        caption="Payment records"
        cardTitle={(row) => (
          <AppLink href={`/payments/${row.id}`}>
            {formatReferenceId(row.id, "PAY", row.createdAt)} · {formatPhp(row.amountCentavos)}
          </AppLink>
        )}
      />
      <Pagination
        page={intentsPage.page}
        pageSize={intentsPage.pageSize}
        total={intentsPage.total}
        hasMore={intentsPage.hasMore}
        makeHref={hrefFor}
      />
    </>
  );
}

async function ProviderEventsTable() {
  const eventsPage = await getAdminRepository().listProviderEvents({
    page: 1,
    pageSize: PAGE_SIZE,
  });

  const eventColumns: ReadonlyArray<ColumnDef<ProviderEventRow>> = [
    {
      key: "booking",
      header: "Booking",
      render: (row) => (
        <AppLink
          href={`/bookings/${row.bookingId}`}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
        >
          {formatReferenceId(row.bookingId, "BK")}
        </AppLink>
      ),
    },
    {
      key: "type",
      header: "Event type",
      render: (row) => <span className="dk-badge dk-badge-neutral">{row.type}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {formatPhp(row.amountCentavos)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          tone={providerEventStatusTone(row.status)}
          label={providerEventStatusLabel(row.status)}
        />
      ),
    },
    {
      key: "reference",
      header: "Reference",
      render: (row) => <code style={{ fontSize: 12 }}>{row.providerReferenceLabel}</code>,
    },
    {
      key: "receivedAt",
      header: "Received",
      render: (row) => (
        <span style={{ fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
          <time dateTime={row.receivedAt}>{formatDateTime(row.receivedAt)}</time>
        </span>
      ),
    },
  ];

  if (eventsPage.items.length === 0) {
    return (
      <EmptyState title="No provider events" description="There are no provider events recorded." />
    );
  }

  return (
    <RecordList
      rows={eventsPage.items}
      columns={eventColumns}
      getRowKey={(row) => row.id}
      caption="Payment provider events"
      cardTitle={(row) => formatReferenceId(row.bookingId, "BK")}
    />
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  return (
    <div className="dk-summary-card" role="group" aria-label={label}>
      <p className="dk-summary-card-label">{label}</p>
      <p className="dk-summary-card-value">{value}</p>
      {hint ? <p className="dk-summary-card-hint">{hint}</p> : null}
    </div>
  );
}

function PaymentsLedgerFallback() {
  return (
    <section role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading payments overview…</span>
      <div className="dk-page-header">
        <div>
          <SkeletonBone variant="title" style={{ width: 260 }} />
          <SkeletonBone variant="subtitle" style={{ width: "70%", marginTop: 10 }} />
        </div>
      </div>
      <div className="dk-card" style={{ marginBottom: 16 }} aria-hidden="true">
        <SkeletonBone variant="badge" />
        <SkeletonBone variant="text-sm" style={{ width: "58%", marginTop: 8 }} />
      </div>
      <div className="dk-summary-grid" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="dk-summary-card">
            <SkeletonBone variant="text-sm" style={{ width: "55%" }} />
            <SkeletonBone variant="title" style={{ width: "72%", marginTop: 10 }} />
            <SkeletonBone variant="text-sm" style={{ width: "40%", marginTop: 8 }} />
          </div>
        ))}
      </div>
    </section>
  );
}
