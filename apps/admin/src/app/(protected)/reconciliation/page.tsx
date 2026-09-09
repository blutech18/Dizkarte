import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp, formatPhpSigned } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, SkeletonCardGrid, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";
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

const RECONCILIATION_SORT_OPTIONS = [
  { value: "newest", label: "Newest checked" },
  { value: "oldest", label: "Oldest checked" },
  { value: "diff_desc", label: "Largest discrepancy" },
] as const;

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
 * Compares each payment intent against its provider event and ledger transaction.
 * Real-time summary counts and row listings stream independently under Suspense.
 */
export default async function ReconciliationPage({
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
  const isValidStatus = status && (STATUS_OPTIONS as ReadonlyArray<string>).includes(status);
  const activeSort = sort && RECONCILIATION_SORT_OPTIONS.some((opt) => opt.value === sort) ? sort : undefined;
  const cleanQ = q?.trim() || undefined;
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
          search={{
            label: "Search reconciliation by booking or payment reference",
            placeholder: "Search booking, payment reference...",
            value: q?.trim() ?? "",
          }}
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
            {
              name: "sort",
              label: "Sort reconciliation",
              allLabel: "Newest checked",
              value: activeSort,
              options: RECONCILIATION_SORT_OPTIONS,
            },
          ]}
        />

        <Suspense
          key={`${isValidStatus ? status : ""}|${cleanQ ?? ""}|${activeSort ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={8} />}
        >
          <ReconciliationTable
            page={page}
            status={isValidStatus ? (status as ReconciliationStatus) : undefined}
            q={cleanQ}
            sort={activeSort}
          />
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
      <SummaryCard label="Matched" value={summary.matched} tone="success" />
      <SummaryCard label="Duplicate" value={summary.duplicate} tone={summary.duplicate > 0 ? "warning" : undefined} />
      <SummaryCard label="Quarantined" value={summary.quarantined} tone={summary.quarantined > 0 ? "error" : undefined} />
      <SummaryCard label="Mismatch" value={summary.mismatch} tone={summary.mismatch > 0 ? "error" : undefined} />
      <SummaryCard label="Unmatched" value={summary.unmatched} tone={summary.unmatched > 0 ? "info" : undefined} />
      <SummaryCard label="Total" value={summary.total} />
    </div>
  );
}

async function ReconciliationTable({
  page,
  status,
  q,
  sort,
}: {
  readonly page: number;
  readonly status: ReconciliationStatus | undefined;
  readonly q: string | undefined;
  readonly sort: string | undefined;
}) {
  const result = await getAdminRepository().listReconciliationRows({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(q ? { query: q } : {}),
    ...(sort ? { sort } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<ReconciliationRow>> = [
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
      key: "paymentIntent",
      header: "Payment",
      render: (row) =>
        row.paymentIntentId ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <AppLink
              href={`/payments/${row.paymentIntentId}`}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
            >
              {formatReferenceId(row.paymentIntentId, "PAY")}
            </AppLink>
            <CopyButton text={row.paymentIntentId} label="payment ID" variant="icon" />
          </div>
        ) : (
          <span className="dk-muted">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={tone(row.status)} label={reconciliationStatusLabel(row.status)} />
      ),
    },
    {
      key: "payment",
      header: "Payment",
      render: (row) =>
        row.paymentAmountCentavos === null ? (
          <span className="dk-muted">—</span>
        ) : (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatPhp(row.paymentAmountCentavos)}</span>
        ),
    },
    {
      key: "provider",
      header: "Provider event",
      render: (row) =>
        row.providerEventAmountCentavos === null ? (
          <span className="dk-muted">—</span>
        ) : (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatPhp(row.providerEventAmountCentavos)}</span>
        ),
    },
    {
      key: "ledger",
      header: "Ledger",
      render: (row) =>
        row.ledgerAmountCentavos === null ? (
          <span className="dk-muted">—</span>
        ) : (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatPhp(row.ledgerAmountCentavos)}</span>
        ),
    },
    {
      key: "difference",
      header: "Difference",
      render: (row) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            fontWeight: row.differenceCentavos !== 0 ? 700 : 400,
            color: row.differenceCentavos !== 0 ? "var(--dk-error)" : "inherit",
          }}
        >
          {formatPhpSigned(row.differenceCentavos)}
        </span>
      ),
    },
    {
      key: "checkedAt",
      header: "Checked",
      render: (row) => (
        <span style={{ fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
          <time dateTime={row.checkedAt}>{formatDateTime(row.checkedAt)}</time>
        </span>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
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
        cardTitle={(row) => (
          <span>
            {formatReferenceId(row.bookingId, "BK")} · {reconciliationStatusLabel(row.status)}
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

function SummaryCard({
  label,
  value,
  tone: cardTone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone?: "success" | "warning" | "error" | "info" | undefined;
}) {
  return (
    <div
      className="dk-card"
      role="group"
      aria-label={label}
      style={{
        padding: "14px 16px",
        borderColor: cardTone === "error" ? "var(--dk-errorSoft)" : undefined,
      }}
    >
      <p className="dk-muted" style={{ margin: 0, fontSize: 12 }}>
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0 0",
          fontSize: "1.35rem",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color:
            cardTone === "error"
              ? "var(--dk-error)"
              : cardTone === "warning"
                ? "var(--dk-warning)"
                : "inherit",
        }}
      >
        {value}
      </p>
    </div>
  );
}
