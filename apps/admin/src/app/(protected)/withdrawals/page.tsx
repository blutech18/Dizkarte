import type { Metadata } from "next";
import { Suspense } from "react";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { WITHDRAWAL_STATUS_OPTIONS, withdrawalStatusLabel, withdrawalStatusTone } from "./status";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import type { WithdrawalRow } from "@/lib/repository/types";
import { WithdrawalRowActions } from "./WithdrawalRowActions";

export const metadata: Metadata = { title: "Withdrawals & payouts" };

const PAGE_SIZE = 20;

const WITHDRAWAL_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Highest amount" },
  { value: "amount_asc", label: "Lowest amount" },
] as const;

/**
 * Withdrawals & payouts queue.
 *
 * Provides oversight into tasker withdrawal requests and disbursement states.
 * Real-time filter controls with search and sorting stream behind Suspense.
 */
export default async function WithdrawalsPage({
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
  const activeStatus = (WITHDRAWAL_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;
  const activeSort = sort && WITHDRAWAL_SORT_OPTIONS.some((opt) => opt.value === sort) ? sort : undefined;
  const cleanQ = q?.trim() || undefined;
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
          search={{
            label: "Search withdrawals by reference or tasker",
            placeholder: "Search reference, tasker name...",
            value: q?.trim() ?? "",
          }}
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
            {
              name: "sort",
              label: "Sort withdrawals",
              allLabel: "Newest first",
              value: activeSort,
              options: WITHDRAWAL_SORT_OPTIONS,
            },
          ]}
        />
        <Suspense
          key={`${activeStatus ?? ""}|${cleanQ ?? ""}|${activeSort ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={6} />}
        >
          <WithdrawalsTable
            page={page}
            status={activeStatus}
            q={cleanQ}
            sort={activeSort}
          />
        </Suspense>
      </PageSection>
    </>
  );
}

async function WithdrawalsTable({
  page,
  status,
  q,
  sort,
}: {
  readonly page: number;
  readonly status: string | undefined;
  readonly q: string | undefined;
  readonly sort: string | undefined;
}) {
  const availability = getAdminRepository().getFinanceProviderAvailability();
  const result = await getAdminRepository().listWithdrawals({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(q ? { query: q } : {}),
    ...(sort ? { sort } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<WithdrawalRow>> = [
    {
      key: "reference",
      header: "Withdrawal",
      render: (row) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>
            {formatReferenceId(row.id, "WTH", row.requestedAt)}
          </span>
          <CopyButton text={row.id} label="withdrawal ID" variant="icon" />
        </div>
      ),
    },
    {
      key: "tasker",
      header: "Tasker",
      render: (row) => <span style={{ fontWeight: 600, fontSize: 13.5 }}>{row.taskerDisplayName}</span>,
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
      render: (row) => (
        <span style={{ fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
          <time dateTime={row.requestedAt}>{formatDateTime(row.requestedAt)}</time>
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <WithdrawalRowActions
          withdrawalId={row.id}
          status={row.status}
          disabled={!availability.payoutProviderAvailable}
          disabledReason={availability.reason}
          disabledReasonPresentation="tooltip"
        />
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
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
        cardTitle={(row) => `${row.taskerDisplayName} · ${formatPhp(row.amountCentavos)}`}
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
