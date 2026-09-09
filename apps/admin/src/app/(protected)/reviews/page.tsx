import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import type { ReviewRow } from "@/lib/repository/types";
import { ReviewActionsPanel } from "./ReviewActionsPanel";
import { REVIEW_STATUS_OPTIONS, reviewStatusLabel, reviewStatusTone } from "./status";

export const metadata: Metadata = { title: "Reviews" };

const PAGE_SIZE = 20;

const REVIEW_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "score_high", label: "Highest rating" },
  { value: "score_low", label: "Lowest rating" },
] as const;

/**
 * Review moderation queue.
 *
 * Comment text is visible here to allow moderators to assess appropriateness,
 * language, and compliance. Hiding also corrects the reviewee's rating aggregate.
 * The boundary key tracks status, search query, sort, and pagination state.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    status?: string;
    q?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT", "ADMIN_SUPER"]);
  const { status, q, sort, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const activeStatus = (REVIEW_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;
  const activeSort = sort && REVIEW_SORT_OPTIONS.some((opt) => opt.value === sort) ? sort : undefined;
  const cleanQ = q?.trim() || undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reviews" }]} />
      <PageSection
        title="Reviews"
        subtitle="Hiding a review removes it from the app and withdraws its score from the reviewee's rating average. Every decision requires a reason and is recorded against your Admin account."
      >
        <QueueFilters
          basePath="/reviews"
          search={{
            label: "Search reviews by comment, task, reviewer, or reviewee",
            placeholder: "Search comment, task, parties, booking...",
            value: q?.trim() ?? "",
          }}
          selects={[
            {
              name: "status",
              label: "Filter by review state",
              allLabel: "All reviews",
              value: activeStatus,
              options: REVIEW_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: reviewStatusLabel(option),
              })),
            },
            {
              name: "sort",
              label: "Sort reviews",
              allLabel: "Newest first",
              value: activeSort,
              options: REVIEW_SORT_OPTIONS,
            },
          ]}
        />
        <Suspense
          key={`${activeStatus ?? ""}|${cleanQ ?? ""}|${activeSort ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={7} />}
        >
          <ReviewsTable
            page={page}
            status={activeStatus}
            q={cleanQ}
            sort={activeSort}
          />
        </Suspense>
      </PageSection>
    </>
  );
}

async function ReviewsTable({
  page,
  status,
  q,
  sort,
}: {
  readonly page: number;
  readonly status: string | undefined;
  readonly q: string | undefined;
  readonly sort: string | undefined;
}) {
  const repository = getAdminRepository();
  const result = await repository.listReviews({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(q ? { query: q } : {}),
    ...(sort ? { sort } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<ReviewRow>> = [
    {
      key: "task",
      header: "Task / Booking",
      render: (row) => (
        <div>
          <AppLink
            href={`/bookings/${row.bookingId}`}
            style={{ fontWeight: 600, fontSize: 13 }}
          >
            {row.taskTitle}
          </AppLink>
          <div style={{ fontSize: 12, color: "var(--dk-textSecondary)", fontFamily: "ui-monospace, monospace" }}>
            {formatReferenceId(row.bookingId, "BK")}
          </div>
        </div>
      ),
    },
    {
      key: "parties",
      header: "Reviewer → Reviewee",
      render: (row) => (
        <div style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>{row.reviewerDisplayName}</span>
          <span style={{ color: "var(--dk-textSecondary)", margin: "0 6px" }}>→</span>
          <span style={{ fontWeight: 500 }}>{row.revieweeDisplayName}</span>
        </div>
      ),
    },
    {
      key: "score",
      header: "Rating",
      render: (row) => (
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 13.5 }}>
          ★ {row.score}.0
        </span>
      ),
    },
    {
      key: "comment",
      header: "Comment",
      render: (row) =>
        row.comment ? (
          <blockquote className="dk-quote" style={{ margin: 0, fontSize: 13 }}>
            {row.comment}
          </blockquote>
        ) : (
          <span className="dk-muted" style={{ fontSize: 12.5 }}>No comment</span>
        ),
    },
    {
      key: "submittedAt",
      header: "Submitted",
      render: (row) => (
        <span style={{ fontSize: 12.5, color: "var(--dk-textSecondary)" }}>
          <time dateTime={row.submittedAt}>{formatDateTime(row.submittedAt)}</time>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={reviewStatusTone(row.status)} label={reviewStatusLabel(row.status)} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => <ReviewActionsPanel reviewId={row.id} status={row.status} />,
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    params.set("page", String(nextPage));
    return `/reviews?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState title="No reviews" description="There are no reviews matching this filter." />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Reviews"
        cardTitle={(row) => `${row.taskTitle} (★ ${row.score}.0)`}
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
