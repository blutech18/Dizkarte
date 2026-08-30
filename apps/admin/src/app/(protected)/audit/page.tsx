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
import type { AuditLogRow } from "@/lib/repository/types";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 20;

/**
 * Audit log.
 *
 * The shell — breadcrumbs and heading — depends on no query, so it is returned
 * immediately and the log table streams in behind its own Suspense boundary.
 * Awaiting the query here would hold back chrome the operator can already read
 * while the slowest query decides when the whole page appears.
 *
 * The boundary is keyed by the page number so paging shows the skeleton again
 * rather than leaving the previous page of entries on screen as if it were the
 * answer to the new request.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPER"]);
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit log" }]} />
      <PageSection
        title="Audit log"
        subtitle="Every material verification, moderation, role, dispute, refund, freeze, payout, or sensitive-access event."
      >
        <Suspense key={`${page}`} fallback={<TableRegionSkeleton columns={5} />}>
          <AuditLogTable page={page} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function AuditLogTable({ page }: { readonly page: number }) {
  const repository = getAdminRepository();
  const result = await repository.listAuditLogs({ page, pageSize: PAGE_SIZE });

  const columns: ReadonlyArray<ColumnDef<AuditLogRow>> = [
    { key: "actor", header: "Actor", render: (row) => row.actor },
    { key: "action", header: "Action", render: (row) => row.action },
    { key: "resource", header: "Resource", render: (row) => row.resource },
    {
      key: "reason",
      header: "Reason",
      render: (row) => row.reason ?? <NotApplicable />,
    },
    {
      key: "at",
      header: "Recorded",
      render: (row) => <time dateTime={row.at}>{formatDateTime(row.at)}</time>,
    },
  ];

  function hrefFor(nextPage: number): string {
    return `/audit?page=${nextPage}`;
  }

  if (result.items.length === 0) {
    return <EmptyState title="No audit entries" description="Nothing has been recorded yet." />;
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
