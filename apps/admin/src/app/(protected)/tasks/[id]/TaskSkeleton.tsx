import { SkeletonBone } from "@/components/ui/AsyncState";

/**
 * Placeholder for the streamed task record.
 *
 * Mirrors the real layout element for element — header with status, the request
 * card, attachments, decisions, then the discovery action — so nothing moves
 * when the record arrives. Shared with `loading.tsx` so the route-level and
 * streaming placeholders cannot drift apart.
 */
export function TaskRecordSkeleton() {
  return (
    <>
      <div className="dk-detail-header" aria-hidden="true">
        <div className="dk-detail-header-main">
          <SkeletonBone variant="title" style={{ width: 300 }} />
          <SkeletonBone style={{ width: 140, height: 36, borderRadius: "var(--dk-radius-sm)" }} />
        </div>
        <SkeletonBone variant="subtitle" style={{ width: "58%", marginTop: 10 }} />
        <div className="dk-detail-header-meta">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBone key={i} variant="text-sm" style={{ width: 130 }} />
          ))}
        </div>
      </div>

      <div className="dk-card" aria-hidden="true">
        <SkeletonBone variant="title" style={{ width: "30%" }} />
        <div style={{ marginTop: 16 }}>
          <SkeletonBone variant="text" style={{ width: "94%" }} />
          <SkeletonBone variant="text" style={{ width: "88%", marginTop: 6 }} />
        </div>
        <div className="dk-fact-grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <SkeletonBone variant="text-sm" style={{ width: "58%" }} />
              <SkeletonBone variant="text" style={{ width: "78%", marginTop: 6 }} />
            </div>
          ))}
        </div>
      </div>

      {[2, 2].map((rows, card) => (
        <div className="dk-card" key={card} aria-hidden="true">
          <SkeletonBone variant="title" style={{ width: "24%" }} />
          <div style={{ marginTop: 16 }}>
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} style={{ paddingBottom: 14 }}>
                <SkeletonBone variant="text" style={{ width: "46%" }} />
                <SkeletonBone variant="text-sm" style={{ width: "32%", marginTop: 6 }} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="dk-card" aria-hidden="true">
        <SkeletonBone variant="title" style={{ width: "18%" }} />
        <SkeletonBone variant="text-sm" style={{ width: "52%", marginTop: 14 }} />
        <SkeletonBone variant="btn" style={{ width: 120, marginTop: 16 }} />
      </div>
    </>
  );
}
