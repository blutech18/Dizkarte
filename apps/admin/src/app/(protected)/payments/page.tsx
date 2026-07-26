import type { Metadata } from "next";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import type { PaymentIntentRow, ProviderEventRow } from "@/lib/repository/types";

export const metadata: Metadata = { title: "Payments & ledger" };

const PAGE_SIZE = 20;

function eventTone(status: string): BadgeTone {
  switch (status) {
    case "PROCESSED":
      return "success";
    case "QUARANTINED":
      return "error";
    case "DUPLICATE":
      return "warning";
    default:
      return "info";
  }
}

function intentTone(status: string): BadgeTone {
  switch (status) {
    case "RELEASED":
      return "success";
    case "REFUNDED":
      return "warning";
    case "FAILED":
      return "error";
    case "CAPTURED":
      return "info";
    default:
      return "neutral";
  }
}

export default async function PaymentsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ page?: string }>;
}) {
  await requirePageCapability(["ADMIN_FINANCE"]);
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const repository = getAdminRepository();

  const [summary, availability, intentsPage, eventsPage] = await Promise.all([
    repository.getFinanceSummary(),
    repository.getFinanceProviderAvailability(),
    repository.listPaymentIntents({ page, pageSize: PAGE_SIZE }),
    repository.listProviderEvents({ page: 1, pageSize: PAGE_SIZE }),
  ]);

  const intentColumns: ReadonlyArray<ColumnDef<PaymentIntentRow>> = [
    { key: "booking", header: "Booking", render: (row) => row.bookingId },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge tone={intentTone(row.status)} label={row.status} />,
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
      render: (row) => new Date(row.createdAt).toLocaleString("en-PH"),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <a className="dk-btn dk-btn-secondary dk-btn-sm" href={`/payments/${row.id}`}>
          Details
        </a>
      ),
    },
  ];

  const eventColumns: ReadonlyArray<ColumnDef<ProviderEventRow>> = [
    { key: "booking", header: "Booking", render: (row) => row.bookingId },
    { key: "type", header: "Event type", render: (row) => row.type },
    { key: "amount", header: "Amount", render: (row) => formatPhp(row.amountCentavos) },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge tone={eventTone(row.status)} label={row.status} />,
    },
    {
      key: "reference",
      header: "Reference",
      render: (row) => <code>{row.providerReferenceLabel}</code>,
    },
    {
      key: "receivedAt",
      header: "Received",
      render: (row) => new Date(row.receivedAt).toLocaleString("en-PH"),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    return `/payments?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Payments & ledger" }]}
      />
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

        <div
          role="group"
          aria-label="Finance summary"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <SummaryCard label="Protected" value={formatPhp(summary.protectedCentavos)} />
          <SummaryCard label="Captured" value={formatPhp(summary.capturedCentavos)} />
          <SummaryCard label="Released" value={formatPhp(summary.releasedCentavos)} />
          <SummaryCard label="Refunded" value={formatPhp(summary.refundedCentavos)} />
          <SummaryCard
            label="Platform fee"
            value={`${formatPhp(summary.platformFeeCentavos)} (${(summary.platformFeeBps / 100).toFixed(2)}%)`}
          />
          <SummaryCard label="Ledger balance" value={formatPhp(summary.ledgerBalanceCentavos)} />
        </div>
        <p className="dk-field-description" style={{ marginBottom: 24 }}>
          {summary.synthetic
            ? "DEVELOPMENT SYNTHETIC projection — totals are derived from balanced ledger transactions, not a mutable balance field."
            : "Totals are derived from balanced ledger transactions, not a mutable balance field. A non-zero ledger balance is itself a reconciliation signal."}
        </p>

        <h2>Payment records</h2>
        {intentsPage.items.length === 0 ? (
          <EmptyState
            title="No payment records"
            description="There are no payment intents to show."
          />
        ) : (
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
        )}

        <h2 style={{ marginTop: 32 }}>Provider events</h2>
        <p className="dk-muted">
          Reference metadata only — never a raw provider payload, signature, or secret.
        </p>
        {eventsPage.items.length === 0 ? (
          <EmptyState
            title="No provider events"
            description="There are no provider events recorded."
          />
        ) : (
          <RecordList
            rows={eventsPage.items}
            columns={eventColumns}
            getRowKey={(row) => row.id}
            caption="Payment provider events"
            cardTitle={(row) => row.bookingId}
          />
        )}
      </PageSection>
    </>
  );
}

function SummaryCard({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="dk-card" role="group" aria-label={label}>
      <p className="dk-muted" style={{ margin: 0 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>{value}</p>
    </div>
  );
}
