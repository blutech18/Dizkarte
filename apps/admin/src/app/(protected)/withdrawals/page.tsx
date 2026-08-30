import type { Metadata } from "next";
import { Suspense } from "react";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { WITHDRAWAL_STATUS_OPTIONS, withdrawalStatusLabel, withdrawalStatusTone } from "./status";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { WithdrawalRow } from "@/lib/repository/types";
import { WithdrawalRowActions } from "./WithdrawalRowActions";

export const metadata: Metadata = { title: "Withdrawals & payouts" };

const PAGE_SIZE = 20;

/**
 * Withdrawals & payouts.
 *
 * Payout availability is a configuration fact rather than a query, so the
 * "actions unavailable" notice renders with the shell immediately. Only the
 * withdrawal listing has to be fetched, so it alone streams in behind a Suspense
 * boundary keyed by the applied status filter and page — changing the filter
 * re-shows the skeleton instead of leaving the previous rows on screen.
 */
export default async function WithdrawalsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_FINANCE"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  // An unrecognised value must not reach the query as a filter nobody can clear.
  const activeStatus = (WITHDRAWAL_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;
  const availability = getAdminRepository().getFinanceProviderAvailability();

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
        <QueueFilters
          basePath="/withdrawals"
          selects={[
            {
              name: "status",
              label: "Filter by payout status",
              allLabel: "All withdrawals",
              value: activeStatus,
              options: WITHDRAWAL_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: withdrawalStatusLabel(option),
              })),
            },
          ]}
        />
        <Suspense
          key={`${activeStatus ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={4} />}
        >
          <WithdrawalsTable page={page} status={activeStatus} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function WithdrawalsTable({
  page,
  status,
}: {
  readonly page: number;
  readonly status: string | undefined;
}) {
  const availability = getAdminRepository().getFinanceProviderAvailability();
  const result = await getAdminRepository().listWithdrawals({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<WithdrawalRow>> = [
    { key: "tasker", header: "Tasker", render: (row) => row.taskerDisplayName },
    { key: "amount", header: "Amount", render: (row) => formatPhp(row.amountCentavos) },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          tone={withdrawalStatusTone(row.status)}
          label={withdrawalStatusLabel(row.status)}
        />
      ),
    },
    {
      key: "requestedAt",
      header: "Requested",
      render: (row) => <time dateTime={row.requestedAt}>{formatDateTime(row.requestedAt)}</time>,
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

  if (result.items.length === 0) {
    return (
      <EmptyState
        title="No withdrawals"
        description="There are no withdrawals matching this filter."
      />
    );
  }

  return (
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
  );
}
