import { SkeletonBone } from "@/components/ui/AsyncState";

/** Mirrors the detail layout: header with status, then five fact cards. */
export default function Loading() {
  return (
    <div className="dk-detail" role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading application…</span>

      <div className="dk-detail-header" aria-hidden="true">
        <div className="dk-detail-header-main">
          <SkeletonBone variant="title" style={{ width: 250 }} />
          <SkeletonBone variant="badge" />
        </div>
        <SkeletonBone variant="subtitle" style={{ width: "60%", marginTop: 10 }} />
        <div className="dk-detail-header-meta">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBone key={i} variant="text-sm" style={{ width: 130 }} />
          ))}
        </div>
      </div>

      {[2, 3, 5, 1].map((facts, card) => (
        <div className="dk-card" key={card} aria-hidden="true">
          <SkeletonBone variant="title" style={{ width: "36%" }} />
          <div className="dk-fact-grid" style={{ marginTop: 16 }}>
            {Array.from({ length: facts }).map((_, i) => (
              <div key={i}>
                <SkeletonBone variant="text-sm" style={{ width: "60%" }} />
                <SkeletonBone variant="text" style={{ width: "85%", marginTop: 6 }} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="dk-card" aria-hidden="true">
        <SkeletonBone variant="title" style={{ width: "32%" }} />
        <SkeletonBone variant="text-sm" style={{ width: "64%", marginTop: 10 }} />
        <div className="dk-row" style={{ marginTop: 16 }}>
          <SkeletonBone variant="btn" style={{ width: 120 }} />
          <SkeletonBone variant="btn" style={{ width: 100 }} />
        </div>
      </div>
    </div>
  );
}
