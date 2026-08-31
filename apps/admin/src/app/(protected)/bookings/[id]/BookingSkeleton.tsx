import { SkeletonBone } from "@/components/ui/AsyncState";
import { BOOKING_FLOW } from "../flow";

/**
 * Placeholder for the streamed booking record.
 *
 * It mirrors the real layout element for element — header with status, the
 * progress track, the record facts, then the history — so nothing moves when the
 * record arrives. The progress track reuses the live `dk-flow` classes rather
 * than approximating them, which is what keeps the two in step if the flow
 * gains a stage.
 *
 * Shared with `loading.tsx` so the route-level and streaming placeholders cannot
 * drift apart.
 */
export function BookingRecordSkeleton() {
  return (
    <>
      <div className="dk-detail-header" aria-hidden="true">
        <div className="dk-detail-header-main">
          <SkeletonBone variant="title" style={{ width: 280 }} />
          <SkeletonBone variant="badge" />
        </div>
        <SkeletonBone variant="subtitle" style={{ width: "62%", marginTop: 10 }} />
        <div className="dk-detail-header-meta">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBone key={i} variant="text-sm" style={{ width: 130 }} />
          ))}
        </div>
      </div>

      <div className="dk-card" aria-hidden="true">
        <SkeletonBone variant="title" style={{ width: "22%" }} />
        <ol className="dk-flow" style={{ marginTop: 16 }}>
          {BOOKING_FLOW.map((status) => (
            <li className="dk-flow-step dk-flow-step-upcoming" key={status}>
              <span className="dk-flow-marker" />
              <SkeletonBone variant="text-sm" style={{ width: 92 }} />
            </li>
          ))}
        </ol>
      </div>

      <div className="dk-card" aria-hidden="true">
        <SkeletonBone variant="title" style={{ width: "18%" }} />
        <div className="dk-fact-grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <SkeletonBone variant="text-sm" style={{ width: "62%" }} />
              <SkeletonBone variant="text" style={{ width: "80%", marginTop: 6 }} />
            </div>
          ))}
        </div>
      </div>

      <div className="dk-card" aria-hidden="true">
        <SkeletonBone variant="title" style={{ width: "20%" }} />
        <div style={{ marginTop: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ paddingBottom: 14 }}>
              <SkeletonBone variant="text" style={{ width: "52%" }} />
              <SkeletonBone variant="text-sm" style={{ width: "38%", marginTop: 6 }} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
