import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
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

/**
 * Review moderation queue.
 *
 * Comment text is shown here, unlike the evidence and chat surfaces which are
 * metadata-only: deciding whether a review is abusive is impossible without
 * reading it. Hiding also corrects the reviewee's rating aggregate, so a
 * retracted review stops counting toward their average.
 *
 * The shell — breadcrumbs, heading, and who is signed in — needs no query, so it
 * returns immediately and the results table streams in behind its own Suspense
 * boundary. The boundary is keyed by the applied status filter and page so
 * changing either re-shows the skeleton rather than leaving the previous result
 * set on screen as if it answered the new query.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_SUPPORT", "ADMIN_SUPER"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  // An unrecognised value must not reach the query as a filter nobody can clear.
  const activeStatus = (REVIEW_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reviews" }]} />
      <PageSection
        title="Reviews"
        subtitle="Hiding a review removes it from the app and withdraws its score from the reviewee's rating average. Every decision requires a reason and is recorded against your Admin account."
      >
        <QueueFilters
          basePath="/reviews"
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
          ]}
        />
        <Suspense
          key={`${activeStatus ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={6} />}
        >
          <ReviewsTable page={page} status={activeStatus} />
        </Suspense>
        <p className="dk-field-description">Signed in as {session.displayName}.</p>
      </PageSection>
    </>
  );
}

async function ReviewsTable({
  page,
  status,
}: {
  readonly page: number;
  readonly status: string | undefined;
}) {
  const active = (REVIEW_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
    ? status
    : undefined;
  const repository = getAdminRepository();
  const result = await repository.listReviews({
    page,
    pageSize: PAGE_SIZE,
    ...(active ? { status: active } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<ReviewRow>> = [
    { key: "task", header: "Task", render: (row) => row.taskTitle },
    {
      key: "parties",
      header: "Reviewer to reviewee",
      render: (row) => `${row.reviewerDisplayName} to ${row.revieweeDisplayName}`,
    },
    { key: "score", header: "Score", render: (row) => `${row.score} of 5` },
    {
      key: "comment",
      header: "Comment",
      render: (row) =>
        row.comment ? (
          <blockquote className="dk-quote">{row.comment}</blockquote>
        ) : (
          <span className="dk-muted">No comment</span>
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
    if (active) params.set("status", active);
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
        cardTitle={(row) => row.taskTitle}
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
