import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp, formatPhpSigned } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, SkeletonCardGrid, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import type { ReconciliationRow, ReconciliationStatus } from "@/lib/repository/types";
import { RerunReconciliationPanel } from "./RerunReconciliationPanel";

export const metadata: Metadata = { title: "Reconciliation" };

const PAGE_SIZE = 20;

const STATUS_OPTIONS: ReadonlyArray<ReconciliationStatus> = [
  "MATCHED",
  "DUPLICATE",
  "QUARANTINED",
  "MISMATCH",
  "UNMATCHED",
];

/** Plain-language labels; the raw enum is database vocabulary. */
function reconciliationStatusLabel(status: ReconciliationStatus): string {
  switch (status) {
    case "MATCHED":
      return "Matched";
    case "DUPLICATE":
      return "Duplicate";
    case "QUARANTINED":
      return "Quarantined";
    case "MISMATCH":
      return "Mismatch";
    case "UNMATCHED":
      return "Unmatched";
  }
}

function tone(status: ReconciliationStatus): BadgeTone {
  switch (status) {
    case "MATCHED":
      return "success";
    case "MISMATCH":
    case "QUARANTINED":
      return "error";
    case "DUPLICATE":
      return "warning";
    default:
      return "info";
  }
}

/**
 * Reconciliation queue.
 *
 * The shell — breadcrumbs, heading, the re-run control, and the status filter —
 * needs no query, so it is returned immediately. The two reads behind this page
 * are independent (a set of summary counts and the row listing), so each gets
 * its own Suspense boundary and streams in parallel: a slow row listing never
 * holds back the summary, and neither holds back the controls above them.
 *
 * Only the row-listing boundary is keyed by the applied filter and page, so
 * changing the filter re-shows its skeleton rather than leaving the previous
 * rows on screen looking like the answer to the new query; the summary is
 * filter-independent and deliberately stays put.
 */
export default async function ReconciliationPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_FINANCE"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const isValidStatus = status && (STATUS_OPTIONS as ReadonlyArray<string>).includes(status);
  const repository = getAdminRepository();

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reconciliation" }]}
      />
      <PageSection
        title="Reconciliation"
        subtitle={
          repository.synthetic
            ? "DEVELOPMENT SYNTHETIC reconciliation. Compares payment, provider-event, and ledger amounts. Makes no network or provider call."
            : "Compares each payment intent against its provider event and ledger transaction. Classifications are derived on every read from the authoritative rows, so they cannot drift. Makes no network or provider call."
        }
      >
        <Suspense fallback={<SkeletonCardGrid count={6} />}>
          <ReconciliationSummary />
        </Suspense>

        <RerunReconciliationPanel synthetic={repository.synthetic} />

        <QueueFilters
          basePath="/reconciliation"
          selects={[
            {
              name: "status",
              label: "Filter by reconciliation status",
              allLabel: "All rows",
              value: isValidStatus ? status : undefined,
              options: STATUS_OPTIONS.map((option) => ({
                value: option,
                label: reconciliationStatusLabel(option),
              })),
            },
          ]}
        />

        <Suspense
          key={`${isValidStatus ? status : ""}|${page}`}
          fallback={<TableRegionSkeleton columns={8} />}
        >
          <ReconciliationTable page={page} status={status} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function ReconciliationSummary() {
  const summary = await getAdminRepository().getReconciliationSummary();

  return (
    <div
      role="group"
      aria-label="Reconciliation summary"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <SummaryCard label="Matched" value={summary.matched} />
      <SummaryCard label="Duplicate" value={summary.duplicate} />
      <SummaryCard label="Quarantined" value={summary.quarantined} />
      <SummaryCard label="Mismatch" value={summary.mismatch} />
      <SummaryCard label="Unmatched" value={summary.unmatched} />
      <SummaryCard label="Total" value={summary.total} />
    </div>
  );
}

async function ReconciliationTable({
  page,
  status,
}: {
  readonly page: number;
  readonly status: string | undefined;
}) {
  const isValidStatus = status && (STATUS_OPTIONS as ReadonlyArray<string>).includes(status);
  const result = await getAdminRepository().listReconciliationRows({
    page,
    pageSize: PAGE_SIZE,
    ...(isValidStatus ? { status: status as ReconciliationStatus } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<ReconciliationRow>> = [
    { key: "booking", header: "Booking", render: (row) => row.bookingId },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={tone(row.status)} label={reconciliationStatusLabel(row.status)} />
      ),
    },
    {
      key: "payment",
      header: "Payment amount",
      render: (row) =>
        row.paymentAmountCentavos === null ? "—" : formatPhp(row.paymentAmountCentavos),
    },
    {
      key: "provider",
      header: "Provider event amount",
      render: (row) =>
        row.providerEventAmountCentavos === null ? "—" : formatPhp(row.providerEventAmountCentavos),
    },
    {
      key: "ledger",
      header: "Ledger amount",
      render: (row) =>
        row.ledgerAmountCentavos === null ? "—" : formatPhp(row.ledgerAmountCentavos),
    },
    {
      key: "difference",
      header: "Difference",
      render: (row) => formatPhpSigned(row.differenceCentavos),
    },
    {
      key: "paymentIntent",
      header: "Payment",
      render: (row) =>
        row.paymentIntentId ? (
          <AppLink href={`/payments/${row.paymentIntentId}`}>{row.paymentIntentId}</AppLink>
        ) : (
          "—"
        ),
    },
    {
      key: "checkedAt",
      header: "Checked",
      render: (row) => <time dateTime={row.checkedAt}>{formatDateTime(row.checkedAt)}</time>,
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (isValidStatus) params.set("status", status!);
    params.set("page", String(nextPage));
    return `/reconciliation?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState
        title="No reconciliation rows"
        description="There are no reconciliation rows matching this filter."
      />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Reconciliation rows"
        cardTitle={(row) => row.bookingId}
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

function SummaryCard({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="dk-card" role="group" aria-label={label}>
      <p className="dk-muted" style={{ margin: 0 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>{value}</p>
    </div>
  );
}
