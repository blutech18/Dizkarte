import type { Metadata } from "next";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import type { AuditLogRow } from "@/lib/repository/types";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 20;

export default async function AuditLogPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPER"]);
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const repository = getAdminRepository();
  const result = await repository.listAuditLogs({ page, pageSize: PAGE_SIZE });

  const columns: ReadonlyArray<ColumnDef<AuditLogRow>> = [
    { key: "actor", header: "Actor", render: (row) => row.actor },
    { key: "action", header: "Action", render: (row) => row.action },
    { key: "resource", header: "Resource", render: (row) => row.resource },
    { key: "reason", header: "Reason", render: (row) => row.reason ?? "—" },
    { key: "at", header: "At", render: (row) => new Date(row.at).toLocaleString("en-PH") },
  ];

  function hrefFor(nextPage: number): string {
    return `/audit?page=${nextPage}`;
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit log" }]} />
      <PageSection
        title="Audit log"
        subtitle="Every material verification, moderation, role, dispute, refund, freeze, payout, or sensitive-access event."
      >
        {result.items.length === 0 ? (
          <EmptyState title="No audit entries" description="Nothing has been recorded yet." />
        ) : (
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
        )}
      </PageSection>
    </>
  );
}
