import { UserRecordSkeleton } from "./UserSkeleton";

export default function Loading() {
  return (
    <div className="dk-detail" role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading user profile…</span>
      <UserRecordSkeleton />
    </div>
  );
}
