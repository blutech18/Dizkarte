import type { Metadata } from "next";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import type { WithdrawalRow } from "@/lib/repository/types";
import { WithdrawalRowActions } from "./WithdrawalRowActions";

export const metadata: Metadata = { title: "Withdrawals & payouts" };

const PAGE_SIZE = 20;

function tone(status: string): BadgeTone {
  switch (status) {
    case "PAID":
      return "success";
    case "FAILED":
      return "error";
    case "CANCELLED":
      return "neutral";
    case "PROCESSING":
    case "RESERVED":
      return "info";
    default:
      return "warning";
  }
}

export default async function WithdrawalsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_FINANCE"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const repository = getAdminRepository();
  const [result, availability] = await Promise.all([
    repository.listWithdrawals({
      page,
      pageSize: PAGE_SIZE,
      ...(status ? { status } : {}),
    }),
    repository.getFinanceProviderAvailability(),
  ]);

  const columns: ReadonlyArray<ColumnDef<WithdrawalRow>> = [
    { key: "tasker", header: "Tasker", render: (row) => row.taskerDisplayName },
    { key: "amount", header: "Amount", render: (row) => formatPhp(row.amountCentavos) },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge tone={tone(row.status)} label={row.status} />,
    },
    {
      key: "requestedAt",
      header: "Requested",
      render: (row) => new Date(row.requestedAt).toLocaleString("en-PH"),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <WithdrawalRowActions
          withdrawalId={row.id}
          disabled={!availability.payoutProviderAvailable}
          disabledReason={availability.reason}
        />
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/withdrawals?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Withdrawals & payouts" }]}
      />
      <PageSection
        title="Withdrawals & payouts"
        subtitle="Read-only withdrawal history. Approve/reserve/retry controls are disabled because no payout provider is configured."
      >
        <div className="dk-card" style={{ marginBottom: 16 }}>
          <StatusBadge tone="warning" label="Live payout actions unavailable" />
          <p className="dk-muted" style={{ marginTop: 8, marginBottom: 0 }}>
            {availability.reason}
          </p>
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title="No withdrawals"
            description="There are no withdrawals matching this filter."
          />
        ) : (
          <>
            <RecordList
              rows={result.items}
              columns={columns}
              getRowKey={(row) => row.id}
              caption="Withdrawals"
              cardTitle={(row) => row.taskerDisplayName}
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
