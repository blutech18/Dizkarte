import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp, formatPhpSigned } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import {
  paymentStatusLabel,
  paymentStatusTone,
  providerEventStatusLabel,
  providerEventStatusTone,
} from "./status";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton, SkeletonBone } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PaymentIntentRow, ProviderEventRow } from "@/lib/repository/types";

export const metadata: Metadata = { title: "Payments & ledger" };

const PAGE_SIZE = 20;

/**
 * Payments & ledger.
 *
 * Only the breadcrumb trail is data-free here — the PageSection subtitle itself
 * changes depending on whether the ledger is synthetic — so the shell that
 * paints immediately is deliberately small and everything below it streams. The
 * ledger overview (subtitle, provider-availability notice, and summary totals)
 * carries the PageSection, and the two independent tables each stream behind
 * their own boundary so a slow provider-events query never holds back the
 * payment records.
 *
 * The payment-records boundary is keyed by the page number so paging shows the
 * table skeleton again instead of leaving the previous page's rows on screen.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ page?: string }>;
}) {
  await requirePageCapability(["ADMIN_FINANCE"]);
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Payments & ledger" }]}
      />
      <Suspense fallback={<PaymentsLedgerFallback />}>
        <PaymentsLedgerSection page={page} />
      </Suspense>
    </>
  );
}

async function PaymentsLedgerSection({ page }: { readonly page: number }) {
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
      <Suspense key={`${page}`} fallback={<TableRegionSkeleton columns={6} />}>
        <PaymentIntentsTable page={page} />
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

async function PaymentIntentsTable({ page }: { readonly page: number }) {
  const intentsPage = await getAdminRepository().listPaymentIntents({ page, pageSize: PAGE_SIZE });

  const intentColumns: ReadonlyArray<ColumnDef<PaymentIntentRow>> = [
    { key: "booking", header: "Booking", render: (row) => row.bookingId },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={paymentStatusTone(row.status)} label={paymentStatusLabel(row.status)} />
      ),
    },
    { key: "amount", header: "Amount", render: (row) => formatPhp(row.amountCentavos) },
    {
      key: "fee",
      header: "Platform fee",
      render: (row) => formatPhp(row.platformFeeCentavos),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (row) => <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>,
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink className="dk-btn dk-btn-secondary dk-btn-sm" href={`/payments/${row.id}`}>
          Details
        </AppLink>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    return `/payments?${params.toString()}`;
  }

  if (intentsPage.items.length === 0) {
    return (
      <EmptyState title="No payment records" description="There are no payment intents to show." />
    );
  }

  return (
    <>
      <RecordList
        rows={intentsPage.items}
        columns={intentColumns}
        getRowKey={(row) => row.id}
        caption="Payment records"
        cardTitle={(row) => row.bookingId}
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
    { key: "booking", header: "Booking", render: (row) => row.bookingId },
    { key: "type", header: "Event type", render: (row) => row.type },
    { key: "amount", header: "Amount", render: (row) => formatPhp(row.amountCentavos) },
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
      render: (row) => <code>{row.providerReferenceLabel}</code>,
    },
    {
      key: "receivedAt",
      header: "Received",
      render: (row) => <time dateTime={row.receivedAt}>{formatDateTime(row.receivedAt)}</time>,
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
      cardTitle={(row) => row.bookingId}
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

/*
  Overview fallback: the PageSection header, the provider-availability notice,
  and the summary-totals grid, reusing the same dk-page-header / dk-card / grid
  markup so only real values fill in when the ledger query resolves. The two
  tables below carry their own TableRegionSkeleton once this region streams in.
*/
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
