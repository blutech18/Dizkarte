import type { Metadata } from "next";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
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

  const [summary, result] = await Promise.all([
    repository.getReconciliationSummary(),
    repository.listReconciliationRows({
      page,
      pageSize: PAGE_SIZE,
      ...(isValidStatus ? { status: status as ReconciliationStatus } : {}),
    }),
  ]);

  const columns: ReadonlyArray<ColumnDef<ReconciliationRow>> = [
    { key: "booking", header: "Booking", render: (row) => row.bookingId },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge tone={tone(row.status)} label={row.status} />,
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
      render: (row) => formatPhp(row.differenceCentavos),
    },
    {
      key: "paymentIntent",
      header: "Payment",
      render: (row) =>
        row.paymentIntentId ? (
          <a href={`/payments/${row.paymentIntentId}`}>{row.paymentIntentId}</a>
        ) : (
          "—"
        ),
    },
    {
      key: "checkedAt",
      header: "Checked",
      render: (row) => new Date(row.checkedAt).toLocaleString("en-PH"),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (isValidStatus) params.set("status", status!);
    params.set("page", String(nextPage));
    return `/reconciliation?${params.toString()}`;
  }

  function filterHref(nextStatus: ReconciliationStatus | null): string {
    const params = new URLSearchParams();
    if (nextStatus) params.set("status", nextStatus);
    return `/reconciliation?${params.toString()}`;
  }

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

        <RerunReconciliationPanel synthetic={repository.synthetic} />

        <nav
          aria-label="Filter by reconciliation status"
          className="dk-row"
          style={{ margin: "16px 0" }}
        >
          <a className="dk-btn dk-btn-secondary dk-btn-sm" href={filterHref(null)}>
            All
          </a>
          {STATUS_OPTIONS.map((option) => (
            <a key={option} className="dk-btn dk-btn-secondary dk-btn-sm" href={filterHref(option)}>
              {option}
            </a>
          ))}
        </nav>

        {result.items.length === 0 ? (
          <EmptyState
            title="No reconciliation rows"
            description="There are no reconciliation rows matching this filter."
          />
        ) : (
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
        )}
      </PageSection>
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
