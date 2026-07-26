import type { Metadata } from "next";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TicketRow } from "@/lib/repository/types";
import { ticketStatusLabel, ticketStatusTone } from "./status";

export const metadata: Metadata = { title: "Support tickets" };

const PAGE_SIZE = 20;

export default async function SupportTicketsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const repository = getAdminRepository();
  const result = await repository.listTickets({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
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
      render: (row) => new Date(row.updatedAt).toLocaleString("en-PH"),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <a className="dk-btn dk-btn-secondary dk-btn-sm" href={`/support/${row.id}`}>
          Details
        </a>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/support?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Support tickets" }]}
      />
      <PageSection
        title="Support tickets"
        subtitle="Tickets preserve actor, subject/resource, assignee, status, narrative, and history."
      >
        {result.items.length === 0 ? (
          <EmptyState title="No tickets" description="There are no tickets matching this filter." />
        ) : (
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
        )}
      </PageSection>
    </>
  );
}
