import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime, formatElapsed } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { NotApplicable } from "@/components/ui/NotApplicable";
import type { VerificationCaseRow } from "@/lib/repository/types";
import {
  VERIFICATION_STATUS_OPTIONS,
  isVerificationCaseOpen,
  verificationStatusTone,
  verificationStatusLabel,
} from "./status";

export const metadata: Metadata = { title: "Identity verification" };

const PAGE_SIZE = 20;

type VerificationCasesQuery = {
  readonly page: number;
  readonly active: string | undefined;
  readonly search: string;
};

/**
 * Identity verification queue.
 *
 * The shell — breadcrumbs, heading, filter row — depends on no query, so it is
 * returned immediately and the results table streams in behind its own Suspense
 * boundary. Awaiting the query here instead would hold back the whole page,
 * including controls the operator can already read and use.
 *
 * The boundary is keyed by the applied filters so changing a filter shows the
 * skeleton again rather than leaving the previous result set on screen looking
 * like the answer to the new query.
 */
export default async function VerificationListPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, page: pageParam, q } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const search = q?.trim() ?? "";

  /*
    No `status` in the URL means every case, which is what the dashboard card
    links to: its count covers both SUBMITTED and IN_REVIEW, so a single-status
    default would hide rows the count already promised.
  */
  const active = (VERIFICATION_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Identity verification" }]}
      />
      <PageSection
        title="Identity verification"
        subtitle="Manual review of submitted government ID and selfie pairs. Decisions are recorded with actor, reason, and timestamp."
      >
        <QueueFilters
          basePath="/verification"
          search={{
            label: "Search verification cases by name",
            placeholder: "Search by display name",
            value: search,
          }}
          selects={[
            {
              name: "status",
              label: "Filter by case status",
              allLabel: "All cases",
              value: active,
              options: VERIFICATION_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: verificationStatusLabel(option),
              })),
            },
          ]}
        />

        <Suspense
          key={`${search}|${active ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={5} />}
        >
          <VerificationCasesTable page={page} active={active} search={search} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function VerificationCasesTable({ page, active, search }: VerificationCasesQuery) {
  const repository = getAdminRepository();
  const result = await repository.listVerificationCases({
    page,
    pageSize: PAGE_SIZE,
    ...(active ? { status: active } : {}),
    ...(search ? { query: search } : {}),
  });

  /*
    Document counts are deliberately absent: verification document rows are
    subject-only under RLS, so the queue read cannot see them and would show a
    constant 0 for every case. The real count comes from the audited detail read.
  */
  const columns: ReadonlyArray<ColumnDef<VerificationCaseRow>> = [
    {
      key: "user",
      header: "User",
      // The card view already links the same name as its title.
      showInCard: false,
      render: (row) => <AppLink href={`/verification/${row.id}`}>{row.userDisplayName}</AppLink>,
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
    {
      key: "assignee",
      header: "Assigned to",
      render: (row) => row.assignedAdminName ?? <span className="dk-muted">Unassigned</span>,
    },
    {
      key: "submittedAt",
      header: "Submitted",
      render: (row) => <time dateTime={row.submittedAt}>{formatDateTime(row.submittedAt)}</time>,
    },
    {
      key: "waiting",
      header: "Waiting",
      render: (row) =>
        isVerificationCaseOpen(row.status) ? formatElapsed(row.submittedAt) : <NotApplicable />,
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    params.set("status", active ?? "all");
    if (search) params.set("q", search);
    params.set("page", String(nextPage));
    return `/verification?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState
        title={search ? `No cases match “${search}”` : "No verification cases"}
        description={
          search
            ? active
              ? `No ${verificationStatusLabel(active).toLowerCase()} case matches that name. Try another name or clear the status filter.`
              : "No case matches that name. Check the spelling, or search a different person."
            : active
              ? `No case is currently ${verificationStatusLabel(active).toLowerCase()}.`
              : "There are no verification cases to review right now."
        }
      />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Identity verification cases"
        cardTitle={(row) => (
          <AppLink href={`/verification/${row.id}`}>{row.userDisplayName}</AppLink>
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
