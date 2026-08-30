import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
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

/**
 * Support ticket queue.
 *
 * The shell — breadcrumbs and heading — needs no query, so it paints immediately
 * and the results table streams in behind its own Suspense boundary. The boundary
 * is keyed by the applied status filter and page so changing either re-shows the
 * skeleton rather than leaving the previous result set on screen as if it answered
 * the new query.
 */
export default async function SupportTicketsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  // An unrecognised value must not reach the query as a filter nobody can clear.
  const active = (TICKET_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Support tickets" }]}
      />
      <PageSection
        title="Support tickets"
        subtitle="Tickets preserve actor, subject/resource, assignee, status, narrative, and history."
      >
        <QueueFilters
          basePath="/support"
          selects={[
            {
              name: "status",
              label: "Filter by ticket status",
              allLabel: "All tickets",
              value: active,
              options: TICKET_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: ticketStatusLabel(option),
              })),
            },
          ]}
        />
        <Suspense key={`${active ?? ""}|${page}`} fallback={<TableRegionSkeleton columns={7} />}>
          <SupportTicketsTable page={page} status={active} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function SupportTicketsTable({
  page,
  status,
}: {
  readonly page: number;
  readonly status: string | undefined;
}) {
  const active = (TICKET_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;
  const repository = getAdminRepository();
  const result = await repository.listTickets({
    page,
    pageSize: PAGE_SIZE,
    ...(active ? { status: active } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<TicketRow>> = [
    { key: "subject", header: "Subject", render: (row) => row.subject },
    { key: "requester", header: "Requester", render: (row) => row.requesterDisplayName },
    { key: "category", header: "Category", render: (row) => row.category },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={ticketStatusTone(row.status)} label={ticketStatusLabel(row.status)} />
      ),
    },
    { key: "assignee", header: "Assignee", render: (row) => row.assignee ?? "Unassigned" },
    {
      key: "updatedAt",
      header: "Updated",
      render: (row) => <time dateTime={row.updatedAt}>{formatDateTime(row.updatedAt)}</time>,
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink className="dk-btn dk-btn-secondary dk-btn-sm" href={`/support/${row.id}`}>
          Details
        </AppLink>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (active) params.set("status", active);
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
        cardTitle={(row) => row.subject}
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
