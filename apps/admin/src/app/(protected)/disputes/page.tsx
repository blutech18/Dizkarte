import type { Metadata } from "next";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { DisputeRow } from "@/lib/repository/types";
import { disputeStatusLabel, disputeStatusTone } from "./status";

export const metadata: Metadata = { title: "Disputes" };

const PAGE_SIZE = 20;

export default async function DisputesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_FINANCE"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const repository = getAdminRepository();
  const result = await repository.listDisputes({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<DisputeRow>> = [
    { key: "booking", header: "Booking", render: (row) => row.bookingId },
    { key: "amount", header: "Amount", render: (row) => formatPhp(row.amountCentavos) },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={disputeStatusTone(row.status)} label={disputeStatusLabel(row.status)} />
      ),
    },
    { key: "assignee", header: "Assignee", render: (row) => row.assignee ?? "Unassigned" },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <a className="dk-btn dk-btn-secondary dk-btn-sm" href={`/disputes/${row.id}`}>
          Details
        </a>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/disputes?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Disputes" }]} />
      <PageSection
        title="Disputes"
        subtitle="Freezing affected financial activity never rewrites ledger history. Amounts shown are booking totals, not raw provider payloads."
      >
        {result.items.length === 0 ? (
          <EmptyState
            title="No disputes"
            description="There are no disputes matching this filter."
          />
        ) : (
          <>
            <RecordList
              rows={result.items}
              columns={columns}
              getRowKey={(row) => row.id}
              caption="Disputes"
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
        <p className="dk-field-description">Signed in as {session.displayName}.</p>
      </PageSection>
    </>
  );
}
