import type { Metadata } from "next";
import Link from "next/link";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import type { UserRow } from "@/lib/repository/types";
import { UserRowActions } from "./UserRowActions";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 20;

function tone(status: string): BadgeTone {
  switch (status) {
    case "active":
      return "success";
    case "suspended":
      return "warning";
    case "banned":
      return "error";
    default:
      return "neutral";
  }
}

export default async function UsersPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const repository = getAdminRepository();
  const result = await repository.listUsers({
    page,
    pageSize: PAGE_SIZE,
    ...(q ? { query: q } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<UserRow>> = [
    {
      key: "name",
      header: "Name",
      render: (row) => <Link href={`/users/${row.id}`}>{row.displayName}</Link>,
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
      render: (row) => <StatusBadge tone={tone(row.accountStatus)} label={row.accountStatus} />,
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
    if (q) params.set("q", q);
    params.set("page", String(nextPage));
    return `/users?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]} />
      <PageSection
        title="Users"
        subtitle="Privacy-safe projections only — never raw IDs, exact locations, or chat bodies."
      >
        <form method="get" className="dk-row" style={{ marginBottom: 16 }} role="search">
          <label className="dk-visually-hidden" htmlFor="q">
            Search users
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            className="dk-input"
            placeholder="Search by display name"
          />
          <button type="submit" className="dk-btn dk-btn-secondary dk-btn-sm">
            Search
          </button>
        </form>

        {result.items.length === 0 ? (
          <EmptyState title="No users found" description="Try a different search term." />
        ) : (
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
        )}
      </PageSection>
    </>
  );
}
