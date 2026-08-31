import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/ui/AppLink";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mediaStatusLabel, mediaStatusTone } from "../../media/status";
import { taskStatusLabel, taskStatusMeaning, taskStatusTone } from "../status";
import { TaskRowActions } from "../TaskRowActions";
import { TaskRecordSkeleton } from "./TaskSkeleton";

export const metadata: Metadata = { title: "Task" };

function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Task record.
 *
 * Tasks were the one entity the console could list but not open, so the media
 * queue had to link a task by running a title search on the list. This is the
 * destination those links needed.
 *
 * The shell — breadcrumbs and the way back to the queue — needs no query, so it
 * is returned immediately and the record streams in behind its own boundary.
 */
export default async function TaskDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT", "ADMIN_SUPER"]);
  const { id } = await params;

  return (
    <div className="dk-detail">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Tasks", href: "/tasks" },
          { label: "Task" },
        ]}
      />

      <Suspense fallback={<TaskRecordSkeleton />}>
        <TaskRecord taskId={id} />
      </Suspense>

      <p>
        <AppLink href="/tasks">Back to tasks</AppLink>
      </p>
    </div>
  );
}

async function TaskRecord({ taskId }: { readonly taskId: string }) {
  const task = await getAdminRepository().getTask(taskId);
  if (!task) notFound();

  return (
    <>
      <header className="dk-detail-header">
        <div className="dk-detail-header-main">
          <h1>{task.title}</h1>
          <StatusBadge tone={taskStatusTone(task.status)} label={taskStatusLabel(task.status)} />
        </div>
        <p className="dk-detail-header-meaning">{taskStatusMeaning(task.status)}</p>
        <dl className="dk-detail-header-meta">
          <Fact label="Budget">
            <span className="dk-fact-amount">{formatPhp(task.budgetCentavos)}</span>
            {task.currency === "PHP" ? null : ` ${task.currency}`}
          </Fact>
          <Fact label="Posted by">{task.clientDisplayName}</Fact>
          <Fact label="Category">{task.categorySlug || "Uncategorised"}</Fact>
          {/*
            Reports are a separate dimension from lifecycle status, so this is a
            fact rather than a second badge beside the heading.
          */}
          <Fact label="Abuse reports">
            {task.flagged ? "Open report on this task" : "None open"}
          </Fact>
        </dl>
      </header>

      <section className="dk-card" aria-labelledby="request-heading">
        <h2 id="request-heading">What was requested</h2>
        {/* Client-authored copy, quoted rather than restyled as console prose. */}
        <p className="dk-quote">{task.description}</p>
        <dl className="dk-fact-grid">
          <Fact label="Scheduled for">
            {task.sameDay ? (
              "Same day"
            ) : task.scheduledFor ? (
              <time dateTime={task.scheduledFor}>{formatDateTime(task.scheduledFor)}</time>
            ) : (
              <span className="dk-muted">No date set</span>
            )}
          </Fact>
          <Fact label="Locality">
            {task.cityCode ? (
              <>
                {task.cityCode}
                {task.barangayCode ? ` · ${task.barangayCode}` : ""}
                {task.landmark ? ` · ${task.landmark}` : ""}
              </>
            ) : (
              <span className="dk-muted">Not recorded</span>
            )}
          </Fact>
          <Fact label="Posted">
            <time dateTime={task.createdAt}>{formatDateTime(task.createdAt)}</time>
          </Fact>
          <Fact label="Published">
            {task.publishedAt ? (
              <time dateTime={task.publishedAt}>{formatDateTime(task.publishedAt)}</time>
            ) : (
              <span className="dk-muted">Never published</span>
            )}
          </Fact>
          <Fact label="Last change">
            <time dateTime={task.updatedAt}>{formatDateTime(task.updatedAt)}</time>
          </Fact>
          <Fact label="Booking">
            {task.bookingId ? (
              <AppLink href={`/bookings/${task.bookingId}`}>Open booking</AppLink>
            ) : (
              <span className="dk-muted">Not booked</span>
            )}
          </Fact>
        </dl>
        <p className="dk-card-note">
          The locality is the approximate public area, not the exact address.
        </p>
      </section>

      <section className="dk-card" aria-labelledby="attachments-heading">
        <h2 id="attachments-heading">Attachments</h2>
        {task.attachments.length === 0 ? (
          <p className="dk-muted">No photo or clip is attached to this task.</p>
        ) : (
          <>
            <ul className="dk-history">
              {task.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <div className="dk-history-head">
                    <strong>{attachment.kind === "video" ? "Video clip" : "Photo"}</strong>
                    <time className="dk-history-time" dateTime={attachment.createdAt}>
                      {formatDate(attachment.createdAt)}
                    </time>
                  </div>
                  <p className="dk-history-meta">
                    <StatusBadge
                      tone={mediaStatusTone(attachment.moderationStatus)}
                      label={mediaStatusLabel(attachment.moderationStatus)}
                    />
                  </p>
                </li>
              ))}
            </ul>
            {/*
              Previews stay on the media queue: that is the screen that issues
              the short-lived signed URLs and records a decision per item.
            */}
            <p className="dk-card-note">
              <AppLink
                href={`/media?status=all&q=${encodeURIComponent(task.title)}`}
              >
                Review these attachments in the media queue
              </AppLink>
            </p>
          </>
        )}
      </section>

      <section className="dk-card" aria-labelledby="decisions-heading">
        <h2 id="decisions-heading">Admin decisions</h2>
        {task.moderationHistory.length === 0 ? (
          <p className="dk-muted">No Admin decision has been recorded against this task.</p>
        ) : (
          <ol className="dk-history">
            {task.moderationHistory.map((entry) => (
              <li key={entry.id}>
                <div className="dk-history-head">
                  <strong>{entry.action}</strong>
                  <time className="dk-history-time" dateTime={entry.at}>
                    {formatDateTime(entry.at)}
                  </time>
                </div>
                <p className="dk-history-meta">{entry.actor}</p>
                {entry.reason ? <p className="dk-quote">{entry.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="dk-card" aria-labelledby="actions-heading">
        <h2 id="actions-heading">Discovery</h2>
        <p className="dk-card-note" style={{ marginTop: 0 }}>
          {task.status === "REMOVED"
            ? "This task is excluded from public discovery."
            : "This task can appear in public search and the task feed."}
        </p>
        <TaskRowActions taskId={task.id} status={task.status} />
      </section>
    </>
  );
}
