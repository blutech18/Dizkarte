import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateNumeric, formatTimeNumeric, formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, GalleryRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { LinkButton } from "@/components/ui/Button";
import { MediaActionsPanel } from "./MediaActionsPanel";
import { MEDIA_STATUS_OPTIONS, mediaStatusLabel, mediaStatusTone } from "./status";

function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ImageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function VideoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  );
}

export const metadata: Metadata = { title: "Task media" };

const PAGE_SIZE = 12;

/**
 * Task media moderation queue.
 *
 * A gallery rather than a table: the decision is "is this image acceptable", so
 * the image has to be the largest thing on the row. Defaults to the "Needs
 * review" filter, because an empty queue is the goal state and landing on
 * everything ever uploaded buries the work.
 *
 * Previews are short-lived signed URLs. Where one cannot be issued the card says
 * so and Hide is disabled — an Admin should not act on content they cannot see.
 *
 * The shell — breadcrumbs, heading, filter row — needs no query, so it is
 * returned immediately and the gallery (the listing plus a signed preview per
 * item) streams in behind its own Suspense boundary. The boundary is keyed by
 * the active filter and page so changing either re-shows the skeleton instead of
 * leaving the previous grid on screen looking like the answer to the new query.
 */
export default async function MediaPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_SUPPORT", "ADMIN_SUPER"]);
  const { status, page: pageParam, q } = await searchParams;
  const search = q?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  // No `status` in the URL or status="all" means all attachments, matching every other queue.
  const active =
    !status || status === "all"
      ? undefined
      : (MEDIA_STATUS_OPTIONS as ReadonlyArray<string>).includes(status)
        ? status
        : undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Task media" }]} />
      <PageSection
        title="Task media"
        subtitle="Approve or hide a single photo or clip without removing the whole task. Every decision needs a reason and is recorded against your Admin account."
      >
        <QueueFilters
          basePath="/media"
          search={{
            label: "Search attachments by task title",
            placeholder: "Search by task title",
            value: search,
          }}
          selects={[
            {
              name: "status",
              label: "Filter by attachment status",
              allLabel: "All attachments",
              value: active,
              options: MEDIA_STATUS_OPTIONS.map((option) => ({
                value: option,
                label: mediaStatusLabel(option),
              })),
            },
          ]}
        />

        <Suspense
          key={`${active ?? ""}|${search}|${page}`}
          fallback={<GalleryRegionSkeleton />}
        >
          <MediaGallery page={page} active={active} search={search} actor={session.email} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function MediaGallery({
  page,
  active,
  search,
  actor,
}: {
  readonly page: number;
  readonly active: string | undefined;
  readonly search: string;
  readonly actor: string;
}) {
  const repository = getAdminRepository();
  const result = await repository.listTaskMedia({
    page,
    pageSize: PAGE_SIZE,
    ...(active ? { status: active } : {}),
    ...(search ? { query: search } : {}),
  });

  const previews = await Promise.all(
    result.items.map((item) =>
      repository.getMediaPreviewUrl({ storagePath: item.storagePath, actor }),
    ),
  );

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (active) params.set("status", active);
    if (search) params.set("q", search);
    params.set("page", String(nextPage));
    return `/media?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState
        title={
          search
            ? `No attachment matches “${search}”`
            : active === "PENDING"
              ? "Nothing waiting for review"
              : "No attachments"
        }
        description={
          search
            ? "No task title matches that search. Try another title, or clear the search."
            : active === "PENDING"
              ? "Every uploaded attachment has a decision. New uploads appear here automatically."
              : "No attachment matches this filter."
        }
      />
    );
  }

  /*
    No page-level note about previews. "Preview unavailable" in the thumbnail
    already says it, and the disabled Hide button carries the reason in its
    tooltip — a paragraph repeating both was the noisiest thing on the screen.
  */
  return (
    <>
      <ul className="dk-media-grid">
        {result.items.map((item, index) => {
          const preview = previews[index] ?? null;
          return (
            <li key={item.id} className="dk-media-card">
              <div className="dk-media-preview-container">
                {item.kind === "image" && preview ? (
                  /*
                    A plain img, not next/image: the URL is signed and expires
                    in five minutes, and routing private moderation media
                    through the image optimiser would cache it on the server.
                  */
                  <img
                    src={preview}
                    alt={`Attachment on task ${item.taskTitle}`}
                    className="dk-media-thumb"
                  />
                ) : (
                  <div className="dk-media-thumb-empty">
                    {item.kind === "video" ? (
                      <VideoIcon width={28} height={28} className="dk-media-placeholder-icon" aria-hidden="true" />
                    ) : (
                      <ImageIcon width={28} height={28} className="dk-media-placeholder-icon" aria-hidden="true" />
                    )}
                    <span className="dk-media-placeholder-text">
                      {item.kind === "video"
                        ? "Video attachment — no inline preview"
                        : "Preview unavailable"}
                    </span>
                  </div>
                )}
                <span className="dk-media-kind-badge">
                  {item.kind === "video" ? (
                    <>
                      <VideoIcon width={11} height={11} aria-hidden="true" />
                      <span>Video</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon width={11} height={11} aria-hidden="true" />
                      <span>Image</span>
                    </>
                  )}
                </span>
              </div>

              <div className="dk-media-card-body">
                <div className="dk-media-card-header">
                  <StatusBadge
                    tone={mediaStatusTone(item.moderationStatus)}
                    label={mediaStatusLabel(item.moderationStatus)}
                  />
                  <time
                    dateTime={item.createdAt}
                    title={formatDateTime(item.createdAt)}
                    className="dk-datetime-cell dk-media-datetime"
                  >
                    <span className="dk-datetime-date">{formatDateNumeric(item.createdAt)}</span>
                    <span className="dk-datetime-time">{formatTimeNumeric(item.createdAt)}</span>
                  </time>
                </div>

                <h3 className="dk-media-task-title" title={item.taskTitle}>
                  {item.taskTitle}
                </h3>

                <div className="dk-media-identifiers">
                  <span className="dk-media-id-tag" title={`Task ID: ${item.taskId}`}>
                    <span className="dk-media-id-label">Task</span>
                    <span className="dk-ref-code" style={{ fontSize: 11 }}>
                      {formatReferenceId(item.taskId, "TSK")}
                    </span>
                  </span>
                  <span className="dk-media-id-tag" title={`Media ID: ${item.id}`}>
                    <span className="dk-media-id-label">Media</span>
                    <span className="dk-ref-code" style={{ fontSize: 11 }}>
                      {formatReferenceId(item.id, "MED")}
                    </span>
                  </span>
                </div>

                <div className="dk-media-actions-bar">
                  <LinkButton
                    href={`/tasks/${item.taskId}`}
                    size="sm"
                    variant="secondary"
                    className="dk-action-btn dk-media-view-btn"
                    title="View task details"
                  >
                    <EyeIcon width={13} height={13} aria-hidden="true" />
                    <span>View task</span>
                  </LinkButton>
                  <MediaActionsPanel
                    mediaId={item.id}
                    status={item.moderationStatus}
                    previewAvailable={preview !== null}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
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




