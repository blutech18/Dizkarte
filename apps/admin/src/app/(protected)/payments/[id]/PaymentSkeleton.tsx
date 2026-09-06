import { SkeletonBone } from "@/components/ui/AsyncState";

export function PaymentRecordSkeleton() {
  return (
    <>
      <div className="dk-booking-hero" aria-hidden="true">
        <div className="dk-card-header-flex" style={{ marginBottom: 20 }}>
          <SkeletonBone variant="title" style={{ width: "45%", height: 32 }} />
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

      <div className="dk-booking-grid" aria-hidden="true">
        <div className="dk-booking-col">
          <div className="dk-card">
            <SkeletonBone variant="title" style={{ width: 160, marginBottom: 16 }} />
            <div className="dk-fact-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="dk-fact">
                  <SkeletonBone variant="text-sm" style={{ width: 60 }} />
                  <SkeletonBone variant="text" style={{ width: 100, marginTop: 5 }} />
                </div>
              ))}
            </div>
          </div>
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 180 }} />
              <SkeletonBone variant="badge" style={{ width: 90 }} />
            </div>
            <SkeletonBone variant="text-sm" style={{ width: "90%", marginTop: 8 }} />
            <SkeletonBone variant="text-sm" style={{ width: "40%", marginTop: 12 }} />
          </div>
          <div className="dk-card">
            <SkeletonBone variant="title" style={{ width: 140, marginBottom: 16 }} />
            <SkeletonBone variant="text-sm" style={{ width: "60%" }} />
          </div>
        </div>

        <div className="dk-booking-col">
          <div className="dk-card">
            <div className="dk-card-header-flex">
              <SkeletonBone variant="title" style={{ width: 180 }} />
              <SkeletonBone variant="badge" style={{ width: 80 }} />
            </div>
            <SkeletonBone variant="text-sm" style={{ width: "95%", marginBottom: 16 }} />
            <div className="dk-payment-actions-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="dk-payment-action-item">
                  <SkeletonBone variant="btn" style={{ width: "100%", height: 36 }} />
                  <SkeletonBone variant="text-sm" style={{ width: "80%", marginTop: 4 }} />
                </div>
              ))}
            </div>
          </div>
          <div className="dk-card">
            <SkeletonBone variant="title" style={{ width: 150, marginBottom: 16 }} />
            <SkeletonBone variant="text-sm" style={{ width: "70%" }} />
          </div>
          <div className="dk-card">
            <SkeletonBone variant="title" style={{ width: 100, marginBottom: 16 }} />
            <SkeletonBone variant="text-sm" style={{ width: "60%" }} />
          </div>
        </div>
      </div>
    </>
  );
}
