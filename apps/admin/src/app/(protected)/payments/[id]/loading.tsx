import { PaymentRecordSkeleton } from "./PaymentSkeleton";

export default function Loading() {
  return (
    <div className="dk-detail" role="status" aria-live="polite">
      <PaymentRecordSkeleton />
    </div>
  );
}
