import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { NotApplicable } from "@/components/ui/NotApplicable";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { CopyButton } from "@/components/ui/CopyButton";
import type { AuditLogRow } from "@/lib/repository/types";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 20;

const AUDIT_ACTION_OPTIONS = [
  { value: "verification.decide", label: "Verification decision" },
  { value: "dispute.assign", label: "Dispute assignment" },
  { value: "dispute.resolve", label: "Dispute resolution" },
  { value: "refund.process", label: "Refund processing" },
  { value: "withdrawal.approve", label: "Withdrawal approval" },
  { value: "user.freeze", label: "User freeze / unfreeze" },
  { value: "role.grant", label: "Role management" },
  { value: "setting.update", label: "Setting update" },
];

const AUDIT_SORT_OPTIONS = [
  { value: "oldest", label: "Oldest first" },
];

export default async function AuditLogPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    page?: string;
    q?: string;
    action?: string;
    sort?: string;
  }>;
}) {
  await requirePageCapability(["ADMIN_SUPER"]);
  const { page: pageParam, q, action, sort } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const cleanQ = q?.trim() || "";
  const activeAction = action?.trim() || undefined;
  const activeSort = sort?.trim() || undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit log" }]} />
      <PageSection
        title="Audit log"
        subtitle="Every material verification, moderation, role, dispute, refund, freeze, payout, or sensitive-access event."
      >
        <QueueFilters
          basePath="/audit"
          search={{
            label: "Search audit log by actor, action, resource, or reason",
            placeholder: "Search actor, action, resource, reason...",
            value: cleanQ,
          }}
          selects={[
            {
              name: "action",
              label: "Filter by action",
              allLabel: "All actions",
              value: activeAction,
              options: AUDIT_ACTION_OPTIONS,
            },
            {
              name: "sort",
              label: "Sort audit events",
              allLabel: "Newest first",
              value: activeSort,
              options: AUDIT_SORT_OPTIONS,
            },
          ]}
        />
        <Suspense
          key={`${activeAction ?? ""}|${cleanQ}|${activeSort ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={5} />}
        >
          <AuditLogTable
            page={page}
            q={cleanQ}
            action={activeAction}
            sort={activeSort}
          />
        </Suspense>
      </PageSection>
    </>
  );
}

async function AuditLogTable({
  page,
  q,
  action,
  sort,
}: {
  readonly page: number;
  readonly q: string;
  readonly action?: string | undefined;
  readonly sort?: string | undefined;
}) {
  const repository = getAdminRepository();
  const result = await repository.listAuditLogs({
    page,
    pageSize: PAGE_SIZE,
    query: q,
    action,
    sort,
  });

  const columns: ReadonlyArray<ColumnDef<AuditLogRow>> = [
    {
      key: "actor",
      header: "Actor",
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{row.actor}</span>
          {row.capability ? (
            <span style={{ fontSize: 12, color: "var(--dk-textSecondary)", fontFamily: "ui-monospace, monospace" }}>
              {row.capability}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (row) => (
        <span
          className="dk-badge dk-badge--neutral"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
        >
          {row.action}
        </span>
      ),
    },
    {
      key: "resource",
      header: "Resource",
      render: (row) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>{row.resource}</span>
          <CopyButton text={row.resource} label="resource" variant="icon" />
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (row) =>
        row.reason ? (
          <span style={{ fontSize: 13 }}>{row.reason}</span>
        ) : (
          <NotApplicable />
        ),
    },
    {
      key: "at",
      header: "Recorded",
      render: (row) => (
        <span style={{ fontSize: 12.5, color: "var(--dk-textSecondary)", whiteSpace: "nowrap" }}>
          <time dateTime={row.at}>{formatDateTime(row.at)}</time>
        </span>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    if (q) params.set("q", q);
    if (action) params.set("action", action);
    if (sort) params.set("sort", sort);
    return `/audit?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState
        title="No audit entries found"
        description="No audit events matched your search and filter criteria."
      />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Audit log"
        cardTitle={(row) => row.action}
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
