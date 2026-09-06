import { SkeletonBone } from "@/components/ui/AsyncState";

export function TaskerRecordSkeleton() {
  return (
    <>
      <div className="dk-booking-hero" aria-hidden="true">
        <div className="dk-card-header-flex" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, width: "60%" }}>
            <SkeletonBone style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              <SkeletonBone variant="title" style={{ width: "50%", height: 28 }} />
              <SkeletonBone variant="text-sm" style={{ width: "35%" }} />
            </div>
          </div>
          <SkeletonBone style={{ width: 230, height: 36, borderRadius: "var(--dk-radius-sm)" }} />
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
          {/* Card 1: About the Applicant */}
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 170 }} />
            </div>
            <div className="dk-fact-grid" style={{ marginTop: 16 }}>
              <div>
                <SkeletonBone variant="text-sm" style={{ width: "40%" }} />
                <SkeletonBone variant="text" style={{ width: "90%", height: 48, marginTop: 8 }} />
              </div>
              <div>
                <SkeletonBone variant="text-sm" style={{ width: "50%" }} />
                <SkeletonBone variant="text" style={{ width: "90%", height: 48, marginTop: 8 }} />
              </div>
            </div>
          </div>

          {/* Card 2: Services & Coverage */}
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 180 }} />
              <SkeletonBone variant="badge" style={{ width: 90 }} />
            </div>
            <div className="dk-fact-grid" style={{ marginTop: 16 }}>
              <div>
                <SkeletonBone variant="text-sm" style={{ width: "40%" }} />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <SkeletonBone variant="badge" style={{ width: 80 }} />
                  <SkeletonBone variant="badge" style={{ width: 90 }} />
                </div>
              </div>
              <div>
                <SkeletonBone variant="text-sm" style={{ width: "45%" }} />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <SkeletonBone variant="badge" style={{ width: 85 }} />
                  <SkeletonBone variant="badge" style={{ width: 75 }} />
                </div>
              </div>
              <div>
                <SkeletonBone variant="text-sm" style={{ width: "50%" }} />
                <SkeletonBone variant="text" style={{ width: "60%", marginTop: 6 }} />
              </div>
            </div>
          </div>

          {/* Card 3: Completeness */}
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 190 }} />
              <SkeletonBone variant="badge" style={{ width: 110 }} />
            </div>
            <SkeletonBone variant="text-sm" style={{ width: "65%", marginBottom: 16 }} />
            <div className="dk-fact-grid">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  <SkeletonBone variant="text-sm" style={{ width: "40%" }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                    <SkeletonBone variant="badge" style={{ width: 70 }} />
                    <SkeletonBone variant="text-sm" style={{ width: "50%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dk-booking-col">
          {/* Card 1: Decision */}
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 140 }} />
              <SkeletonBone variant="badge" style={{ width: 90 }} />
            </div>
            <SkeletonBone variant="text-sm" style={{ width: "95%", marginBottom: 16 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SkeletonBone variant="btn" style={{ width: "100%", height: 38 }} />
              <SkeletonBone variant="btn" style={{ width: "100%", height: 38 }} />
              <SkeletonBone variant="btn" style={{ width: "100%", height: 38 }} />
            </div>
          </div>

          {/* Card 2: Payout */}
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 130 }} />
              <SkeletonBone variant="badge" style={{ width: 60 }} />
            </div>
            <div className="dk-fact-grid" style={{ marginTop: 12 }}>
              <SkeletonBone variant="text-sm" style={{ width: "40%" }} />
              <SkeletonBone variant="text" style={{ width: "70%", marginTop: 6 }} />
            </div>
            <SkeletonBone style={{ width: "100%", height: 60, borderRadius: 8, marginTop: 16 }} />
          </div>

          {/* Card 3: References */}
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 170 }} />
            </div>
            <div className="dk-fact-grid" style={{ marginTop: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="dk-fact">
                  <SkeletonBone variant="text-sm" style={{ width: 70 }} />
                  <SkeletonBone variant="text" style={{ width: 120, marginTop: 5 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
