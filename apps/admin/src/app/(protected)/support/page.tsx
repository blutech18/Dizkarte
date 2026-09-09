import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TicketRow } from "@/lib/repository/types";
import { TICKET_STATUS_OPTIONS, ticketStatusLabel, ticketStatusTone } from "./status";

export const metadata: Metadata = { title: "Support tickets" };

const PAGE_SIZE = 20;

const TICKET_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;

/**
 * Support ticket queue.
 *
 * The shell — breadcrumbs and heading — paints immediately without waiting
 * for database queries, while the results stream behind a Suspense boundary.
 * The boundary key tracks status, search query, sort, and pagination state.
 */
export default async function SupportTicketsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    status?: string;
    q?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const session = await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, q, sort, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const activeStatus = status
    ? TICKET_STATUS_OPTIONS.find((s) => s.toLowerCase() === status.toLowerCase())
    : undefined;
  const activeSort = sort && TICKET_SORT_OPTIONS.some((opt) => opt.value === sort) ? sort : undefined;
  const cleanQ = q?.trim() || undefined;

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Support tickets" }]}
      />
      <PageSection
        title="Support tickets"
        subtitle="Tickets preserve actor, subject context, assignee, status, narrative, and history."
      >
        <QueueFilters
          basePath="/support"
          search={{
            label: "Search tickets by reference, subject, requester, or assignee",
            placeholder: "Search reference, subject, requester, assignee...",
            value: q?.trim() ?? "",
          }}
          selects={[
            {
              name: "status",
              label: "Filter by ticket status",
              allLabel: "All tickets",
              value: activeStatus,
              options: TICKET_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: ticketStatusLabel(option),
              })),
            },
            {
              name: "sort",
              label: "Sort tickets",
              allLabel: "Newest first",
              value: activeSort,
              options: TICKET_SORT_OPTIONS,
            },
          ]}
        />
        <Suspense
          key={`${activeStatus ?? ""}|${cleanQ ?? ""}|${activeSort ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={7} />}
        >
          <SupportTicketsTable
            page={page}
            status={activeStatus}
            q={cleanQ}
            sort={activeSort}
          />
        </Suspense>
        <p className="dk-field-description">Signed in as {session.displayName}.</p>
      </PageSection>
    </>
  );
}

async function SupportTicketsTable({
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
  const repository = getAdminRepository();
  const result = await repository.listTickets({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(q ? { query: q } : {}),
    ...(sort ? { sort } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<TicketRow>> = [
    {
      key: "reference",
      header: "Ticket",
      render: (row) => (
        <AppLink
          href={`/support/${row.id}`}
          style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, fontSize: 13 }}
        >
          {formatReferenceId(row.id, "TCK", row.updatedAt)}
        </AppLink>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      render: (row) => (
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{row.subject}</span>
      ),
    },
    {
      key: "requester",
      header: "Requester",
      render: (row) => (
        <span style={{ fontSize: 13 }}>{row.requesterDisplayName}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (row) => (
        <span className="dk-badge dk-badge-neutral">{row.category}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={ticketStatusTone(row.status)} label={ticketStatusLabel(row.status)} />
      ),
    },
    {
      key: "updatedAt",
      header: "Updated",
      render: (row) => (
        <span style={{ fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
          <time dateTime={row.updatedAt}>{formatDateTime(row.updatedAt)}</time>
        </span>
      ),
    },
    {
      key: "assignee",
      header: "Assignee",
      render: (row) => (
        row.assignee ? (
          <span style={{ fontSize: 13, fontWeight: 500 }}>{row.assignee}</span>
        ) : (
          <span className="dk-muted" style={{ fontSize: 12.5 }}>Unassigned</span>
        )
      ),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink
          className="dk-btn dk-btn-secondary dk-btn-sm"
          href={`/support/${row.id}`}
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          Review
        </AppLink>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    params.set("page", String(nextPage));
    return `/support?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState title="No tickets" description="There are no tickets matching this filter." />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Support tickets"
        cardTitle={(row) => (
          <AppLink href={`/support/${row.id}`}>
            {formatReferenceId(row.id, "TCK", row.updatedAt)} · {row.subject}
          </AppLink>
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
