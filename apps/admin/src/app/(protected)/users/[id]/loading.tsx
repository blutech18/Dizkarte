import { SkeletonBone } from "@/components/ui/AsyncState";

/**
 * Mirrors the detail layout: header with status, then the standing/activity fact
 * cards and the two history cards. A generic card stack shifted the content
 * sideways as it loaded, because it did not reserve the fact grid.
 */
export default function Loading() {
  return (
    <div className="dk-detail" role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading user…</span>

      <div className="dk-detail-header" aria-hidden="true">
        <div className="dk-detail-header-main">
          <SkeletonBone variant="title" style={{ width: 260 }} />
          <SkeletonBone variant="badge" />
        </div>
        <SkeletonBone variant="subtitle" style={{ width: "58%", marginTop: 10 }} />
        <div className="dk-detail-header-meta">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBone key={i} variant="text-sm" style={{ width: 120 }} />
          ))}
        </div>
      </div>

      {[3, 3].map((facts, card) => (
        <div className="dk-card" key={card} aria-hidden="true">
          <SkeletonBone variant="title" style={{ width: "34%" }} />
          <div className="dk-fact-grid" style={{ marginTop: 16 }}>
            {Array.from({ length: facts }).map((_, i) => (
              <div key={i}>
                <SkeletonBone variant="text-sm" style={{ width: "70%" }} />
                <SkeletonBone variant="text" style={{ width: "50%", marginTop: 6 }} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {[3, 2].map((rows, card) => (
        <div className="dk-card" key={`history-${card}`} aria-hidden="true">
          <SkeletonBone variant="title" style={{ width: "40%" }} />
          <div style={{ marginTop: 16 }}>
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} style={{ paddingBottom: 14, marginBottom: 14 }}>
                <SkeletonBone variant="text" style={{ width: "45%" }} />
                <SkeletonBone variant="text-sm" style={{ width: "62%", marginTop: 6 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {/* Fifth card: account actions. Without it the buttons popped in late. */}
      <div className="dk-card" aria-hidden="true">
        <SkeletonBone variant="title" style={{ width: "30%" }} />
        <SkeletonBone variant="text-sm" style={{ width: "66%", marginTop: 10 }} />
        <div className="dk-row" style={{ marginTop: 16 }}>
          <SkeletonBone variant="btn" style={{ width: 110 }} />
          <SkeletonBone variant="btn" style={{ width: 90 }} />
        </div>
      </div>
    </div>
  );
}
