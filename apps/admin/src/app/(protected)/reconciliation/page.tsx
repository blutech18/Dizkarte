import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { CopyButton } from "@/components/ui/CopyButton";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, SkeletonCardGrid, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { RerunReconciliationPanel } from "./RerunReconciliationPanel";
import type { ReconciliationRow, ReconciliationStatus } from "@/lib/repository/types";

export const metadata: Metadata = {
  title: "Reconciliation",
};

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
];

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
    case "DUPLICATE":
      return "warning";
    case "QUARANTINED":
    case "MISMATCH":
      return "error";
    case "UNMATCHED":
      return "info";
  }
}

function formatPhp(centavos: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(centavos / 100);
}

function formatPhpSigned(centavos: number): string {
  const prefix = centavos > 0 ? "+" : "";
  return `${prefix}${formatPhp(centavos)}`;
}

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
            ? "Development synthetic reconciliation. Compares payment, provider-event, and ledger amounts. Makes no network or provider call."
            : "Compares each payment intent against its provider event and ledger transaction. Classifications are derived on every read from authoritative records without external API calls."
        }
        actions={<RerunReconciliationPanel synthetic={repository.synthetic} />}
      >
        <Suspense fallback={<SkeletonCardGrid count={6} />}>
          <ReconciliationSummary />
        </Suspense>

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
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 12,
        marginBottom: 20,
      }}
    >
      <SummaryCard
        label="Matched"
        value={summary.matched}
        subtext="Balanced across rows"
        tone="success"
      />
      <SummaryCard
        label="Duplicate"
        value={summary.duplicate}
        subtext="Multiple event records"
        tone={summary.duplicate > 0 ? "warning" : undefined}
      />
      <SummaryCard
        label="Quarantined"
        value={summary.quarantined}
        subtext="Signature/payload alert"
        tone={summary.quarantined > 0 ? "error" : undefined}
      />
      <SummaryCard
        label="Mismatch"
        value={summary.mismatch}
        subtext="Amount discrepancy"
        tone={summary.mismatch > 0 ? "error" : undefined}
      />
      <SummaryCard
        label="Unmatched"
        value={summary.unmatched}
        subtext="Awaiting ledger or event"
        tone={summary.unmatched > 0 ? "info" : undefined}
      />
      <SummaryCard
        label="Total"
        value={summary.total}
        subtext="Tracked audit rows"
        tone="neutral"
      />
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
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <AppLink
            href={`/bookings/${row.bookingId}`}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 500 }}
            title={`Booking ${row.bookingId}`}
          >
            {formatReferenceId(row.bookingId, "BK")}
          </AppLink>
          <CopyButton text={row.bookingId} label="booking ID" variant="icon" />
        </div>
      ),
    },
    {
      key: "paymentIntent",
      header: "Payment Ref",
      render: (row) =>
        row.paymentIntentId ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <AppLink
              href={`/payments/${row.paymentIntentId}`}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 500 }}
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
      header: "Payment Amount",
      render: (row) =>
        row.paymentAmountCentavos === null ? (
          <span className="dk-muted">—</span>
        ) : (
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
            {formatPhp(row.paymentAmountCentavos)}
          </span>
        ),
    },
    {
      key: "provider",
      header: "Provider Event",
      render: (row) =>
        row.providerEventAmountCentavos === null ? (
          <span className="dk-muted">—</span>
        ) : (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatPhp(row.providerEventAmountCentavos)}
          </span>
        ),
    },
    {
      key: "ledger",
      header: "Ledger Amount",
      render: (row) =>
        row.ledgerAmountCentavos === null ? (
          <span className="dk-muted">—</span>
        ) : (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatPhp(row.ledgerAmountCentavos)}
          </span>
        ),
    },
    {
      key: "difference",
      header: "Discrepancy",
      render: (row) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            fontWeight: row.differenceCentavos !== 0 ? 700 : 400,
            color: row.differenceCentavos !== 0 ? "var(--dk-errorSolid)" : "var(--dk-textSecondary)",
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
  subtext,
  tone: cardTone,
}: {
  readonly label: string;
  readonly value: number;
  readonly subtext: string;
  readonly tone?: "success" | "warning" | "error" | "info" | "neutral" | undefined;
}) {
  const hasValue = value > 0;

  return (
    <div
      className="dk-card"
      role="group"
      aria-label={label}
      style={{
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        borderRadius: "var(--dk-radius-md)",
        border: "1px solid var(--dk-borderSubtle)",
        background: "var(--dk-surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dk-textSecondary)" }}>
          {label}
        </span>
        {cardTone && cardTone !== "neutral" && hasValue ? (
          <StatusBadge tone={cardTone} label={cardTone === "success" ? "OK" : "Alert"} />
        ) : null}
      </div>
      <div>
        <p
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.1,
            color:
              cardTone === "error" && hasValue
                ? "var(--dk-errorSolid)"
                : cardTone === "warning" && hasValue
                  ? "var(--dk-warningSolid)"
                  : cardTone === "success"
                    ? "var(--dk-successSolid)"
                    : "var(--dk-textPrimary)",
          }}
        >
          {value}
        </p>
        <span
          style={{
            fontSize: 11.5,
            color: "var(--dk-textSecondary)",
            marginTop: 4,
            display: "block",
          }}
        >
          {subtext}
        </span>
      </div>
    </div>
  );
}
