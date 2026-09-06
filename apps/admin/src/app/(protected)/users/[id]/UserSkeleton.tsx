import { SkeletonBone } from "@/components/ui/AsyncState";

export function UserRecordSkeleton() {
  return (
    <>
      <div className="dk-booking-hero" aria-hidden="true">
        <div className="dk-card-header-flex" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, width: "60%" }}>
            <SkeletonBone style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              <SkeletonBone variant="title" style={{ width: "50%", height: 28 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <SkeletonBone variant="badge" style={{ width: 110, height: 22 }} />
              </div>
            </div>
          </div>
          <SkeletonBone style={{ width: 130, height: 36, borderRadius: "var(--dk-radius-sm)" }} />
        </div>

        <SkeletonBone variant="subtitle" style={{ width: "55%", height: 16, marginBottom: 18 }} />

        <div className="dk-booking-metrics">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="dk-fact">
              <SkeletonBone variant="text-sm" style={{ width: "50%" }} />
              <SkeletonBone variant="text" style={{ width: "70%", height: 24, marginTop: 4 }} />
            </div>
          ))}
        </div>
      </div>

      <div className="dk-booking-grid" aria-hidden="true">
        <div className="dk-booking-col">
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 170 }} />
            </div>
            <div className="dk-fact-grid" style={{ marginTop: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <SkeletonBone variant="text-sm" style={{ width: "70%" }} />
                  <SkeletonBone variant="text" style={{ width: "50%", marginTop: 6 }} />
                </div>
              ))}
            </div>
          </div>

          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 160 }} />
            </div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                  <SkeletonBone variant="text" style={{ width: "40%" }} />
                  <SkeletonBone variant="badge" style={{ width: 60 }} />
                </div>
              ))}
            </div>
          </div>

          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 220 }} />
            </div>
            <SkeletonBone variant="text-sm" style={{ width: "80%", marginTop: 14 }} />
          </div>
        </div>

        <div className="dk-booking-col">
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 150 }} />
            </div>
            <SkeletonBone variant="text-sm" style={{ width: "100%", marginTop: 12 }} />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <SkeletonBone variant="btn" style={{ flex: 1, height: 36 }} />
              <SkeletonBone variant="btn" style={{ flex: 1, height: 36 }} />
            </div>
          </div>

          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 160 }} />
            </div>
            <div className="dk-fact-grid" style={{ marginTop: 14 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <SkeletonBone variant="text-sm" style={{ width: "65%" }} />
                  <SkeletonBone variant="text" style={{ width: "60%", marginTop: 6 }} />
                </div>
              ))}
            </div>
          </div>

          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 170 }} />
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <SkeletonBone variant="text-sm" style={{ width: "35%" }} />
              <SkeletonBone variant="text" style={{ width: "65%" }} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
