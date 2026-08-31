import { BookingRecordSkeleton } from "./BookingSkeleton";

/** Mirrors the detail layout: header with status, progress, record, history. */
export default function Loading() {
  return (
    <div className="dk-detail" role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading booking…</span>
      <BookingRecordSkeleton />
    </div>
  );
}
