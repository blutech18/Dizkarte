import { SkeletonBone } from "@/components/ui/AsyncState";
import { BOOKING_FLOW } from "../flow";

/**
 * Placeholder for the streamed booking record.
 *
 * Mirrors the redesigned layout element for element — hero header, progress track,
 * and the two-column grid (task, history, financials, record, participants) — so
 * nothing shifts when the real record arrives.
 */
export function BookingRecordSkeleton() {
  return (
    <>
      {/* Hero Header Skeleton */}
      <div className="dk-booking-hero" aria-hidden="true">
        <div className="dk-card-header-flex" style={{ marginBottom: 20 }}>
          <SkeletonBone variant="title" style={{ width: "50%", height: 32 }} />
          <SkeletonBone style={{ width: 230, height: 36, borderRadius: "var(--dk-radius-sm)" }} />
        </div>
        <div className="dk-booking-metrics">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="dk-fact">
              <SkeletonBone variant="text-sm" style={{ width: "50%" }} />
              <SkeletonBone variant="text" style={{ width: "75%", height: 24, marginTop: 4 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Progress Stepper Skeleton */}
      <div className="dk-card dk-flow-card" aria-hidden="true">
        <div className="dk-card-header-flex">
          <SkeletonBone variant="title" style={{ width: 100 }} />
          <SkeletonBone variant="badge" style={{ width: 80 }} />
        </div>
        <ol className="dk-flow" style={{ marginTop: 16 }}>
          {BOOKING_FLOW.map((status) => (
            <li className="dk-flow-step dk-flow-step-upcoming" key={status}>
              <span className="dk-flow-marker" />
              <SkeletonBone variant="text-sm" style={{ width: 92 }} />
            </li>
          ))}
        </ol>
      </div>

      {/* Two-Column Grid Skeleton */}
      <div className="dk-booking-grid" aria-hidden="true">
        <div className="dk-booking-col">
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 140 }} />
              <SkeletonBone variant="text-sm" style={{ width: 150 }} />
            </div>
            <div className="dk-task-body">
              <div className="dk-task-title-row">
                <div className="dk-task-title-group">
                  <SkeletonBone variant="text-sm" style={{ width: 60 }} />
                  <SkeletonBone variant="text" style={{ width: "85%", height: 22, marginTop: 4 }} />
                </div>
                <SkeletonBone variant="badge" style={{ width: 145, height: 34, borderRadius: 8, flexShrink: 0 }} />
              </div>
              <div className="dk-fact-grid">
                <div className="dk-fact">
                  <SkeletonBone variant="text-sm" style={{ width: 50 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                    <SkeletonBone variant="badge" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                    <SkeletonBone variant="text" style={{ width: 100 }} />
                  </div>
                </div>
                <div className="dk-fact">
                  <SkeletonBone variant="text-sm" style={{ width: 50 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                    <SkeletonBone variant="badge" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                    <SkeletonBone variant="text" style={{ width: 100 }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="dk-card">
            <SkeletonBone variant="title" style={{ width: 100, marginBottom: 16 }} />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 0",
                  borderTop: i > 0 ? "1px solid var(--dk-borderSubtle)" : "none",
                }}
              >
                <SkeletonBone variant="text" style={{ width: "60%" }} />
                <SkeletonBone variant="text-sm" style={{ width: "40%", marginTop: 6 }} />
              </div>
            ))}
          </div>
        </div>

        <div className="dk-booking-col">
          <div className="dk-card">
            <SkeletonBone variant="title" style={{ width: 150, marginBottom: 16 }} />
            <div className="dk-finance-callout">
              <SkeletonBone variant="text-sm" style={{ width: "40%" }} />
              <SkeletonBone variant="title" style={{ width: "60%", height: 28 }} />
              <SkeletonBone variant="text-sm" style={{ width: "90%" }} />
            </div>
          </div>
          <div className="dk-card">
            <SkeletonBone variant="title" style={{ width: 80, marginBottom: 16 }} />
            <div className="dk-fact-grid" style={{ marginTop: 16 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <SkeletonBone variant="text-sm" style={{ width: "50%" }} />
                  <SkeletonBone variant="text" style={{ width: "70%", marginTop: 6 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
