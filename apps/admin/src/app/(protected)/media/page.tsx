import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, GalleryRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { MediaActionsPanel } from "./MediaActionsPanel";
import { MEDIA_STATUS_OPTIONS, mediaStatusLabel, mediaStatusTone } from "./status";

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
  // No `status` in the URL means the default queue, not "everything".
  const active =
    status === "all"
      ? undefined
      : (MEDIA_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
        ? status
        : "PENDING";

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
              // This queue defaults to PENDING, so "all" must be explicit.
              allValue: "all",
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
    params.set("status", active ?? "all");
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
            <li key={item.id} className="dk-card dk-media-card">
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
                <div className="dk-media-thumb dk-media-thumb-empty">
                  <span className="dk-muted">
                    {item.kind === "video"
                      ? "Video attachment — no inline preview"
                      : "Preview unavailable"}
                  </span>
                </div>
              )}
              <div className="dk-media-meta">
                {/*
                  Badge on its own line above the title. Sharing a row with the
                  title made the layout depend on title length: short titles sat
                  beside the badge, long ones wrapped, so no two cards in a row
                  lined up.
                */}
                <StatusBadge
                  tone={mediaStatusTone(item.moderationStatus)}
                  label={mediaStatusLabel(item.moderationStatus)}
                />
                <p className="dk-media-title">
                  <AppLink href={`/tasks/${item.taskId}`}>
                    {item.taskTitle}
                  </AppLink>
                </p>
                <p className="dk-media-uploaded">
                  {/* Exact instant stays on the element; the queue only needs the day. */}
                  <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                    {formatDate(item.createdAt)}
                  </time>
                </p>
                <MediaActionsPanel
                  mediaId={item.id}
                  status={item.moderationStatus}
                  previewAvailable={preview !== null}
                />
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




