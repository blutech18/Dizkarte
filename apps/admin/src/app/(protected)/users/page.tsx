import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import type { UserRow } from "@/lib/repository/types";
import { USER_STATUS_OPTIONS, userStatusLabel, userStatusTone } from "./status";
import { UserRowActions } from "./UserRowActions";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 20;

type UsersQuery = {
  readonly page: number;
  readonly query: string | undefined;
  readonly status: string | undefined;
};

/**
 * Users queue.
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
export default async function UsersPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { q, page: pageParam, status } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const active = (USER_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]} />
      <PageSection
        title="Users"
        subtitle="Privacy-safe projections only — never raw IDs, exact locations, or chat bodies."
      >
        {/*
          Suspend and ban already live on the user detail page with their own
          moderation history. What was missing was reviewing frozen accounts as a
          set, which is a filter, not a separate module.
        */}
        <QueueFilters
          basePath="/users"
          search={{
            label: "Search users by display name",
            placeholder: "Search by display name",
            value: q?.trim() ?? "",
          }}
          selects={[
            {
              name: "status",
              label: "Filter by account status",
              allLabel: "All accounts",
              value: active,
              options: USER_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: userStatusLabel(option),
              })),
            },
          ]}
        />

        <Suspense
          key={`${q ?? ""}|${active ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={4} />}
        >
          <UsersTable page={page} query={q} status={active} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function UsersTable({ page, query, status }: UsersQuery) {
  const result = await getAdminRepository().listUsers({
    page,
    pageSize: PAGE_SIZE,
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<UserRow>> = [
    {
      key: "name",
      header: "Name",
      render: (row) => <AppLink href={`/users/${row.id}`}>{row.displayName}</AppLink>,
    },
    {
      key: "verified",
      header: "Identity",
      render: (row) =>
        row.identityVerified ? (
          <StatusBadge tone="success" label="Verified" />
        ) : (
          <StatusBadge tone="neutral" label="Unverified" />
        ),
    },
    {
      key: "status",
      header: "Account status",
      render: (row) => (
        <StatusBadge
          tone={userStatusTone(row.accountStatus)}
          label={userStatusLabel(row.accountStatus)}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => <UserRowActions userId={row.id} status={row.accountStatus} />,
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/users?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return <EmptyState title="No users found" description="Try a different search term." />;
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Users"
        cardTitle={(row) => row.displayName}
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
