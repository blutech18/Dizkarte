import type { Metadata } from "next";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { VerificationCaseRow } from "@/lib/repository/types";
import { verificationStatusTone, verificationStatusLabel } from "./status";

export const metadata: Metadata = { title: "Identity verification" };

const PAGE_SIZE = 20;

export default async function VerificationListPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const repository = getAdminRepository();
  const result = await repository.listVerificationCases({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<VerificationCaseRow>> = [
    {
      key: "user",
      header: "User",
      render: (row) => <a href={`/verification/${row.id}`}>{row.userDisplayName}</a>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          tone={verificationStatusTone(row.status)}
          label={verificationStatusLabel(row.status)}
        />
      ),
    },
    { key: "documents", header: "Documents", render: (row) => row.documentCount },
    {
      key: "submittedAt",
      header: "Submitted",
      render: (row) => new Date(row.submittedAt).toLocaleString("en-PH"),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/verification?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Identity verification" }]}
      />
      <PageSection
        title="Identity verification"
        subtitle="Manual review of submitted government ID and selfie pairs. Decisions are recorded with actor, reason, and timestamp."
      >
        <div className="dk-row" style={{ marginBottom: 16 }}>
          <FilterLink label="All" href="/verification" active={!status} />
          <FilterLink
            label="Submitted"
            href="/verification?status=SUBMITTED"
            active={status === "SUBMITTED"}
          />
          <FilterLink
            label="In review"
            href="/verification?status=IN_REVIEW"
            active={status === "IN_REVIEW"}
          />
          <FilterLink
            label="Resubmission required"
            href="/verification?status=RESUBMISSION_REQUIRED"
            active={status === "RESUBMISSION_REQUIRED"}
          />
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            title="No verification cases"
            description="There are no cases matching this filter right now."
          />
        ) : (
          <>
            <RecordList
              rows={result.items}
              columns={columns}
              getRowKey={(row) => row.id}
              caption="Identity verification cases"
              cardTitle={(row) => row.userDisplayName}
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

function FilterLink({
  label,
  href,
  active,
}: {
  readonly label: string;
  readonly href: string;
  readonly active: boolean;
}) {
  return (
    <a
      href={href}
      className="dk-btn dk-btn-sm dk-btn-secondary"
      aria-current={active ? "true" : undefined}
    >
      {label}
    </a>
  );
}
