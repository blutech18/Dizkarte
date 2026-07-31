import type { Metadata } from "next";
import Link from "next/link";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatusFilterBar } from "@/components/ui/StatusFilterBar";
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
 */
export default async function MediaPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_SUPPORT", "ADMIN_SUPER"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  // No `status` in the URL means the default queue, not "everything".
  const active =
    status === "all"
      ? undefined
      : (MEDIA_STATUS_OPTIONS as ReadonlyArray<string>).includes(status ?? "")
        ? status
        : "PENDING";

  const repository = getAdminRepository();
  const result = await repository.listTaskMedia({
    page,
    pageSize: PAGE_SIZE,
    ...(active ? { status: active } : {}),
  });

  const previews = await Promise.all(
    result.items.map((item) =>
      repository.getMediaPreviewUrl({ storagePath: item.storagePath, actor: session.email }),
    ),
  );

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    params.set("status", active ?? "all");
    params.set("page", String(nextPage));
    return `/media?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Task media" }]} />
      <PageSection
        title="Task media"
        subtitle="Approve or hide a single photo or clip without removing the whole task. Every decision needs a reason and is recorded against your Admin account."
      >
        <StatusFilterBar
          basePath="/media"
          options={MEDIA_STATUS_OPTIONS}
          active={active}
          label={mediaStatusLabel}
          allLabel="All attachments"
        />

        {result.items.length === 0 ? (
          <EmptyState
            title={active === "PENDING" ? "Nothing waiting for review" : "No attachments"}
            description={
              active === "PENDING"
                ? "Every uploaded attachment has a decision. New uploads appear here automatically."
                : "No attachment matches this filter."
            }
          />
        ) : (
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
                      <StatusBadge
                        tone={mediaStatusTone(item.moderationStatus)}
                        label={mediaStatusLabel(item.moderationStatus)}
                      />
                      <p className="dk-media-title">
                        <Link href={`/tasks?query=${encodeURIComponent(item.taskTitle)}`}>
                          {item.taskTitle}
                        </Link>
                      </p>
                      <p className="dk-field-description">
                        Uploaded {new Date(item.createdAt).toLocaleString("en-PH")}
                      </p>
                      {!preview && item.kind === "image" ? (
                        <p className="dk-field-description">
                          The file can only be previewed while its task is publicly listed.
                        </p>
                      ) : null}
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
        )}
      </PageSection>
    </>
  );
}
