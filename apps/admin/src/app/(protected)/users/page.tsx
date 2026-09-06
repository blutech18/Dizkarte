import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDate, formatTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import type { UserRow } from "@/lib/repository/types";
import { USER_STATUS_OPTIONS, userStatusLabel, userStatusTone } from "./status";
import { UserRowActions } from "./UserRowActions";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 20;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "U"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function roleTone(role: string): BadgeTone {
  if (role.startsWith("ADMIN")) return "brand";
  if (role.toUpperCase() === "TASKER") return "info";
  if (role.toUpperCase() === "CLIENT") return "client";
  return "neutral";
}

function roleLabel(role: string): string {
  switch (role.toUpperCase()) {
    case "CLIENT":
      return "Client";
    case "TASKER":
      return "Tasker";
    case "ADMIN_SUPPORT":
      return "Support Admin";
    case "ADMIN_FINANCE":
      return "Finance Admin";
    case "ADMIN_DISPUTES":
      return "Disputes Admin";
    case "ADMIN_SUPER":
      return "Super Admin";
    default:
      return role;
  }
}

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
          fallback={<TableRegionSkeleton columns={6} />}
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
      key: "user",
      header: "User",
      showInCard: false,
      render: (row) => (
        <div className="dk-user-cell">
          <span className="dk-user-avatar" aria-hidden="true">
            {initials(row.displayName)}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="dk-user-name">{row.displayName}</span>
            <span className="dk-ref-code" style={{ fontSize: 11 }} title={row.id}>
              {formatReferenceId(row.id, "USR")}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (row) => {
        const roles = row.roles && row.roles.length > 0 ? row.roles : ["CLIENT"];
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {roles.map((role) => (
              <StatusBadge
                key={role}
                tone={roleTone(role)}
                label={roleLabel(role)}
              />
            ))}
          </div>
        );
      },
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
      key: "joined",
      header: "Joined",
      render: (row) => (
        <time dateTime={row.createdAt} title={row.createdAt} className="dk-datetime-cell">
          <span className="dk-datetime-date">{formatDate(row.createdAt)}</span>
          <span className="dk-datetime-time">{formatTime(row.createdAt)}</span>
        </time>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <UserRowActions
          userId={row.id}
          status={row.accountStatus}
          showProfileLink
        />
      ),
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
        cardTitle={(row) => (
          <div className="dk-user-cell">
            <span className="dk-user-avatar" aria-hidden="true">
              {initials(row.displayName)}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="dk-user-name">{row.displayName}</span>
              <span className="dk-ref-code" style={{ fontSize: 11 }}>
                {formatReferenceId(row.id, "USR")}
              </span>
            </div>
          </div>
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
