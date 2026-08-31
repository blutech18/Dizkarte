import { TaskRecordSkeleton } from "./TaskSkeleton";

/** Mirrors the detail layout: header with status, request, attachments, decisions. */
export default function Loading() {
  return (
    <div className="dk-detail" role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading task…</span>
      <TaskRecordSkeleton />
    </div>
  );
}
