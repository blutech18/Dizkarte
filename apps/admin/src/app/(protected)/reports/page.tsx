import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDate, formatTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ReportRow } from "@/lib/repository/types";
import { REPORT_STATUS_OPTIONS, reportStatusLabel, reportStatusTone } from "./status";

export const metadata: Metadata = { title: "Reports" };

const PAGE_SIZE = 20;

function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ResourceIcon({ type }: { readonly type: string }) {
  switch (type.toLowerCase()) {
    case "user":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "task":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "message":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "booking":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    default:
      return null;
  }
}

function categoryFriendlyName(category: string): string {
  switch (category.toLowerCase()) {
    case "other":
      return "Other Issue";
    case "spam":
      return "Spam / Unsolicited";
    case "harassment":
      return "Harassment / Abuse";
    case "inappropriate":
      return "Inappropriate Content";
    case "fraud":
      return "Fraud / Scam";
    case "safety":
      return "Safety Concern";
    default:
      return category.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}

function resourceTypeFriendlyName(resourceType: string): string {
  switch (resourceType.toLowerCase()) {
    case "user":
      return "User Account";
    case "task":
      return "Task Posting";
    case "message":
      return "Chat Message";
    case "booking":
      return "Booking Case";
    case "offer":
      return "Tasker Offer";
    default:
      return resourceType.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}

export const RESOURCE_TYPE_OPTIONS = [
  { value: "user", label: "User accounts" },
  { value: "task", label: "Task postings" },
  { value: "message", label: "Chat messages" },
  { value: "booking", label: "Booking cases" },
  { value: "offer", label: "Tasker offers" },
] as const;

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;

/**
 * Reports queue.
 *
 * The shell — breadcrumbs and heading — needs no query, so it is returned
 * immediately and the results table streams in behind its own Suspense boundary.
 * Awaiting the list here instead would hold back chrome the operator can already
 * read while the slowest query runs.
 *
 * The boundary is keyed by the filter parameters and page number so navigating
 * re-shows the skeleton rather than leaving the previous result set on screen
 * looking like the answer to the new query.
 */
export default async function ReportsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    status?: string;
    type?: string;
    q?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, type, q, sort, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const activeStatus = status
    ? REPORT_STATUS_OPTIONS.find((opt) => opt.toLowerCase() === status.toLowerCase())
    : undefined;
  const activeType = RESOURCE_TYPE_OPTIONS.some((opt) => opt.value === type) ? type : undefined;
  const activeSort = sort && SORT_OPTIONS.some((opt) => opt.value === sort) ? sort : undefined;
  const cleanQ = q?.trim() || undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }]} />
      <PageSection
        title="Reports"
        subtitle="User-submitted reports on tasks, users, messages, offers, and bookings requiring moderation oversight."
      >
        <QueueFilters
          basePath="/reports"
          search={{
            label: "Search reports by reference, category, or assignee",
            placeholder: "Search reference, category, assignee...",
            value: q?.trim() ?? "",
          }}
          selects={[
            {
              name: "status",
              label: "Filter by report status",
              allLabel: "All statuses",
              value: activeStatus,
              options: REPORT_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: reportStatusLabel(option),
              })),
            },
            {
              name: "type",
              label: "Filter by target entity",
              allLabel: "All targets",
              value: activeType,
              options: RESOURCE_TYPE_OPTIONS,
            },
            {
              name: "sort",
              label: "Sort reports",
              allLabel: "Newest first",
              value: activeSort,
              options: SORT_OPTIONS,
            },
          ]}
        />
        <Suspense
          key={`${activeStatus ?? ""}|${activeType ?? ""}|${cleanQ ?? ""}|${activeSort ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={7} />}
        >
          <ReportsTable
            page={page}
            status={activeStatus}
            type={activeType}
            q={cleanQ}
            sort={activeSort}
          />
        </Suspense>
      </PageSection>
    </>
  );
}

async function ReportsTable({
  page,
  status,
  type,
  q,
  sort,
}: {
  readonly page: number;
  readonly status: string | undefined;
  readonly type: string | undefined;
  readonly q: string | undefined;
  readonly sort: string | undefined;
}) {
  const repository = getAdminRepository();
  const result = await repository.listReports({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(type ? { resourceType: type } : {}),
    ...(q ? { query: q } : {}),
    ...(sort ? { sort } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<ReportRow>> = [
    {
      key: "report",
      header: "Report Ref",
      render: (row) => {
        const formattedRef = formatReferenceId(row.id, "RPT", row.createdAt);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "left" }}>
            <AppLink
              href={`/reports/${row.id}`}
              style={{ fontWeight: 650, color: "var(--dk-textPrimary)" }}
            >
              {formattedRef}
            </AppLink>
            <span
              className="dk-ref-code"
              style={{ fontSize: 11, color: "var(--dk-textMuted)" }}
              title={row.id}
            >
              {row.id}
            </span>
          </div>
        );
      },
    },
    {
      key: "resource",
      header: "Issue & Target",
      render: (row) => (
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            gap: 3,
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 650, color: "var(--dk-textPrimary)" }}>
            {categoryFriendlyName(row.category)}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              color: "var(--dk-textSecondary)",
            }}
          >
            <ResourceIcon type={row.resourceType} />
            <span>{resourceTypeFriendlyName(row.resourceType)}</span>
          </span>
        </div>
      ),
    },
    {
      key: "reporter",
      header: "Reporter",
      render: (row) => {
        const isProtected = row.reporterDisplayName === "(protected)";
        return isProtected ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12.5,
              color: "var(--dk-textMuted)",
            }}
            title="Reporter identity is protected by support policy"
          >
            <ShieldIcon />
            <span>Protected identity</span>
          </span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--dk-textPrimary)" }}>
            {row.reporterDisplayName}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={reportStatusTone(row.status)} label={reportStatusLabel(row.status)} />
      ),
    },
    {
      key: "assignee",
      header: "Assignee",
      render: (row) =>
        row.assignee ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "rgba(110, 32, 223, 0.12)",
                color: "var(--dk-primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10.5,
                fontWeight: 700,
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              {row.assignee.charAt(0).toUpperCase()}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{row.assignee}</span>
          </div>
        ) : (
          <span
            style={{
              fontSize: 11.5,
              color: "var(--dk-textMuted)",
              background: "var(--dk-bg-subtle, rgba(0, 0, 0, 0.02))",
              padding: "2px 7px",
              borderRadius: "var(--dk-radius-sm)",
              border: "1px dashed var(--dk-borderSubtle)",
            }}
          >
            Unassigned
          </span>
        ),
    },
    {
      key: "createdAt",
      header: "Reported",
      render: (row) => (
        <time dateTime={row.createdAt} className="dk-datetime-cell">
          <span className="dk-datetime-date">{formatDate(row.createdAt)}</span>
          <span className="dk-datetime-time">{formatTime(row.createdAt)}</span>
        </time>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink
          className="dk-btn dk-btn-secondary dk-btn-sm"
          href={`/reports/${row.id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span>Review</span>
          <ArrowRightIcon />
        </AppLink>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    params.set("page", String(nextPage));
    return `/reports?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState title="No reports" description="There are no reports matching this filter." />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Reports queue"
        cardTitle={(row) => formatReferenceId(row.id, "RPT", row.createdAt)}
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
