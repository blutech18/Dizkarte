import { SkeletonBone } from "@/components/ui/AsyncState";

export function VerificationRecordSkeleton() {
  return (
    <>
      <div className="dk-booking-hero" aria-hidden="true">
        <div className="dk-card-header-flex" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, width: "60%" }}>
            <SkeletonBone style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              <SkeletonBone variant="title" style={{ width: "60%", height: 28 }} />
              <SkeletonBone variant="text-sm" style={{ width: "40%" }} />
            </div>
          </div>
          <SkeletonBone style={{ width: 230, height: 36, borderRadius: "var(--dk-radius-sm)" }} />
        </div>
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
              <SkeletonBone variant="badge" style={{ width: 90 }} />
            </div>
            <SkeletonBone variant="text-sm" style={{ width: "100%", height: 48, marginBottom: 16 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="dk-verification-doc-item">
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <SkeletonBone style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <SkeletonBone variant="title" style={{ width: "50%", height: 16 }} />
                      <SkeletonBone variant="text-sm" style={{ width: "30%" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 190 }} />
              <SkeletonBone variant="badge" style={{ width: 70 }} />
            </div>
            <SkeletonBone variant="text-sm" style={{ width: "80%", marginBottom: 12 }} />
            <SkeletonBone variant="text-sm" style={{ width: "60%" }} />
          </div>
        </div>

        <div className="dk-booking-col">
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 140 }} />
              <SkeletonBone variant="badge" style={{ width: 90 }} />
            </div>
            <SkeletonBone variant="text-sm" style={{ width: "95%", marginBottom: 16 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SkeletonBone variant="btn" style={{ width: "100%", height: 38 }} />
              <SkeletonBone variant="btn" style={{ width: "100%", height: 38 }} />
            </div>
          </div>

          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 130 }} />
              <SkeletonBone variant="badge" style={{ width: 80 }} />
            </div>
            <div className="dk-fact-grid" style={{ marginTop: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="dk-fact">
                  <SkeletonBone variant="text-sm" style={{ width: 60 }} />
                  <SkeletonBone variant="text" style={{ width: 100, marginTop: 5 }} />
                </div>
              ))}
            </div>
            <SkeletonBone variant="btn" style={{ width: "100%", height: 36, marginTop: 18 }} />
          </div>
        </div>
      </div>
    </>
  );
}
