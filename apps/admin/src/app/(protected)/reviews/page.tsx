import type { Metadata } from "next";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ReviewRow } from "@/lib/repository/types";
import { ReviewActionsPanel } from "./ReviewActionsPanel";
import { reviewStatusLabel, reviewStatusTone } from "./status";

export const metadata: Metadata = { title: "Reviews" };

const PAGE_SIZE = 20;

/**
 * Review moderation queue.
 *
 * Comment text is shown here, unlike the evidence and chat surfaces which are
 * metadata-only: deciding whether a review is abusive is impossible without
 * reading it. Hiding also corrects the reviewee's rating aggregate, so a
 * retracted review stops counting toward their average.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_SUPPORT", "ADMIN_SUPER"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const repository = getAdminRepository();
  const result = await repository.listReviews({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<ReviewRow>> = [
    { key: "task", header: "Task", render: (row) => row.taskTitle },
    {
      key: "parties",
      header: "Reviewer to reviewee",
      render: (row) => `${row.reviewerDisplayName} to ${row.revieweeDisplayName}`,
    },
    { key: "score", header: "Score", render: (row) => `${row.score} of 5` },
    { key: "comment", header: "Comment", render: (row) => row.comment || "No comment" },
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
    params.set("page", String(nextPage));
    return `/reviews?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reviews" }]} />
      <PageSection
        title="Reviews"
        subtitle="Hiding a review removes it from the app and withdraws its score from the reviewee's rating average. Every decision requires a reason and is recorded against your Admin account."
      >
        {result.items.length === 0 ? (
          <EmptyState title="No reviews" description="There are no reviews matching this filter." />
        ) : (
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
        )}
        <p className="dk-field-description">Signed in as {session.displayName}.</p>
      </PageSection>
    </>
  );
}
