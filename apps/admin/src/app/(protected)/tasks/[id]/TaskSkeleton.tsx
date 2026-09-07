import { SkeletonBone } from "@/components/ui/AsyncState";

/**
 * Placeholder for the streamed task record.
 *
 * Mirrors the real layout element for element — header hero with status,
 * two-column grid with request card, attachments, decisions, and sidebar.
 * Shared with `loading.tsx` so the route-level and streaming placeholders
 * cannot drift apart.
 */
export function TaskRecordSkeleton() {
  return (
    <>
      <nav className="dk-detail-nav" aria-hidden="true">
        <SkeletonBone variant="text-sm" style={{ width: 180 }} />
        <SkeletonBone style={{ width: 110, height: 32, borderRadius: "var(--dk-radius-sm)" }} />
      </nav>

      {/* Hero Card Skeleton */}
      <div className="dk-task-hero" aria-hidden="true">
        <div className="dk-card-header-flex" style={{ marginBottom: 14 }}>
          <SkeletonBone variant="title" style={{ width: "45%" }} />
          <SkeletonBone style={{ width: 140, height: 36, borderRadius: "var(--dk-radius-sm)" }} />
        </div>
        <SkeletonBone variant="subtitle" style={{ width: "55%", marginBottom: 20 }} />
        <div className="dk-task-metrics">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="dk-fact" style={{ padding: "14px 16px", borderRadius: "var(--dk-radius-md)" }}>
              <SkeletonBone variant="text-sm" style={{ width: 70 }} />
              <SkeletonBone variant="text" style={{ width: 120, height: 24, marginTop: 8 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Two-Column Grid Skeleton */}
      <div className="dk-task-content-grid" aria-hidden="true">
        {/* Main Column */}
        <div className="dk-task-main-col">
          <div className="dk-card dk-task-card">
            <SkeletonBone variant="title" style={{ width: "35%", marginBottom: 16 }} />
            <SkeletonBone variant="text" style={{ width: "95%", height: 48, borderRadius: "var(--dk-radius-md)", marginBottom: 16 }} />
            <div className="dk-task-highlight-box">
              <SkeletonBone style={{ height: 64, borderRadius: "var(--dk-radius-md)" }} />
              <SkeletonBone style={{ height: 64, borderRadius: "var(--dk-radius-md)" }} />
            </div>
            <div className="dk-fact-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <SkeletonBone variant="text-sm" style={{ width: "50%" }} />
                  <SkeletonBone variant="text" style={{ width: "80%", marginTop: 6 }} />
                </div>
              ))}
            </div>
          </div>

          <div className="dk-card dk-task-card">
            <SkeletonBone variant="title" style={{ width: "25%", marginBottom: 16 }} />
            <div className="dk-attachment-gallery">
              {Array.from({ length: 2 }).map((_, i) => (
                <SkeletonBone key={i} style={{ height: 80, borderRadius: "var(--dk-radius-md)" }} />
              ))}
            </div>
          </div>

          <div className="dk-card dk-task-card">
            <SkeletonBone variant="title" style={{ width: "28%", marginBottom: 16 }} />
            <SkeletonBone variant="text-sm" style={{ width: "60%" }} />
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="dk-task-side-col">
          <div className="dk-card dk-task-card">
            <SkeletonBone variant="title" style={{ width: "40%", marginBottom: 14 }} />
            <SkeletonBone style={{ height: 44, borderRadius: "var(--dk-radius-md)", marginBottom: 14 }} />
            <SkeletonBone variant="btn" style={{ width: "100%", height: 36 }} />
          </div>

          <div className="dk-card dk-task-card">
            <SkeletonBone variant="title" style={{ width: "50%", marginBottom: 14 }} />
            <SkeletonBone variant="text-sm" style={{ width: "70%", marginBottom: 10 }} />
            <SkeletonBone variant="text-sm" style={{ width: "60%" }} />
          </div>
        </div>
      </div>
    </>
  );
}
