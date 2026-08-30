import { SkeletonBone } from "@/components/ui/AsyncState";

/** Mirrors the detail layout: header with status, then three cards. */
export default function Loading() {
  return (
    <div className="dk-detail" role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading booking…</span>

      <div className="dk-detail-header" aria-hidden="true">
        <div className="dk-detail-header-main">
          <SkeletonBone variant="title" style={{ width: 280 }} />
          <SkeletonBone variant="badge" />
        </div>
        <SkeletonBone variant="subtitle" style={{ width: "62%", marginTop: 10 }} />
        <div className="dk-detail-header-meta">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBone key={i} variant="text-sm" style={{ width: 130 }} />
          ))}
        </div>
      </div>

      {[3, 2].map((facts, card) => (
        <div className="dk-card" key={card} aria-hidden="true">
          <SkeletonBone variant="title" style={{ width: "34%" }} />
          <div className="dk-fact-grid" style={{ marginTop: 16 }}>
            {Array.from({ length: facts }).map((_, i) => (
              <div key={i}>
                <SkeletonBone variant="text-sm" style={{ width: "62%" }} />
                <SkeletonBone variant="text" style={{ width: "80%", marginTop: 6 }} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="dk-card" aria-hidden="true">
        <SkeletonBone variant="title" style={{ width: "26%" }} />
        <div style={{ marginTop: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ paddingBottom: 14 }}>
              <SkeletonBone variant="text" style={{ width: "52%" }} />
              <SkeletonBone variant="text-sm" style={{ width: "38%", marginTop: 6 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
