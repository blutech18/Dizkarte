import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDate, formatElapsed, formatTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { NotApplicable } from "@/components/ui/NotApplicable";
import { formatReferenceId } from "@/lib/format-id";
import type { TaskerApplicationRow } from "@/lib/repository/types";
import {
  TASKER_STATUS_OPTIONS,
  isAwaitingAdminDecision,
  taskerApplicationStatusLabel,
  taskerApplicationStatusTone,
} from "./status";
import { TaskerRowActions } from "./TaskerRowActions";
import { SpecialtiesModalButton } from "./SpecialtiesModalButton";

export const metadata: Metadata = { title: "Tasker applications" };

const PAGE_SIZE = 20;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "U"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

type TaskerApplicationsQuery = {
  readonly page: number;
  readonly active: string | undefined;
  readonly search: string;
};

/**
 * Tasker applications queue.
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
export default async function TaskerApplicationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, page: pageParam, q } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const search = q?.trim() ?? "";
  // An unrecognised value must not be passed to the query as a filter nobody
  // can clear; it falls back to every application.
  const active = (TASKER_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tasker applications" }]}
      />
      <PageSection
        title="Tasker applications"
        subtitle="Application approval is separate from identity verification and is revocable or suspendable at any time."
      >
        <QueueFilters
          basePath="/taskers"
          search={{
            label: "Search applications by applicant name",
            placeholder: "Search by applicant name",
            value: search,
          }}
          selects={[
            {
              name: "status",
              label: "Filter by application status",
              allLabel: "All applications",
              value: active,
              options: TASKER_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: taskerApplicationStatusLabel(option),
              })),
            },
          ]}
        />

        <Suspense
          key={`${search}|${active ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={6} />}
        >
          <TaskerApplicationsTable page={page} active={active} search={search} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function TaskerApplicationsTable({ page, active, search }: TaskerApplicationsQuery) {
  const repository = getAdminRepository();
  const result = await repository.listTaskerApplications({
    page,
    pageSize: PAGE_SIZE,
    ...(active ? { status: active } : {}),
    ...(search ? { query: search } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<TaskerApplicationRow>> = [
    {
      key: "user",
      header: "Applicant",
      showInCard: false,
      render: (row) => (
        <div className="dk-user-cell">
          <span className="dk-user-avatar" aria-hidden="true">
            {initials(row.userDisplayName)}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="dk-user-name">{row.userDisplayName}</span>
            <span className="dk-ref-code" style={{ fontSize: 11 }} title={row.id}>
              {formatReferenceId(row.id, "TAP")}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          tone={taskerApplicationStatusTone(row.status)}
          label={taskerApplicationStatusLabel(row.status)}
        />
      ),
    },
    {
      key: "specialties",
      header: "Specialties",
      render: (row) => (
        <SpecialtiesModalButton
          specialties={row.specialties}
          applicantName={row.userDisplayName}
        />
      ),
    },
    {
      key: "submittedAt",
      header: "Submitted",
      render: (row) => (
        <time dateTime={row.submittedAt} className="dk-datetime-cell">
          <span className="dk-datetime-date">{formatDate(row.submittedAt)}</span>
          <span className="dk-datetime-time">{formatTime(row.submittedAt)}</span>
        </time>
      ),
    },
    {
      key: "waiting",
      header: "Waiting",
      // Only meaningful while the applicant is waiting on this team.
      render: (row) =>
        isAwaitingAdminDecision(row.status) ? formatElapsed(row.submittedAt) : <NotApplicable />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <TaskerRowActions
          applicationId={row.id}
          userId={row.userId}
          status={row.status}
        />
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    params.set("status", active ?? "all");
    if (search) params.set("q", search);
    params.set("page", String(nextPage));
    return `/taskers?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState
        title={search ? `No applications match “${search}”` : "No applications"}
        description={
          search
            ? "No applicant matches that name. Check the spelling, or search a different person."
            : active
              ? `No application is currently ${taskerApplicationStatusLabel(active).toLowerCase()}.`
              : "There are no applications to review right now."
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
        caption="Tasker applications"
        cardTitle={(row) => (
          <div className="dk-user-cell">
            <span className="dk-user-avatar" aria-hidden="true">
              {initials(row.userDisplayName)}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="dk-user-name">{row.userDisplayName}</span>
              <span className="dk-ref-code" style={{ fontSize: 11 }}>
                {formatReferenceId(row.id, "TAP")}
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
