import { SkeletonBone } from "@/components/ui/AsyncState";

function VerificationSectionSkeleton({ rows }: { readonly rows: number }) {
  return (
    <div className="dk-verification-section" aria-hidden="true">
      <div className="dk-verification-section-heading">
        <SkeletonBone variant="title" style={{ width: "38%" }} />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonBone
          key={index}
          variant="text"
          style={{ width: `${90 - index * 9}%`, marginBottom: index === rows - 1 ? 0 : 12 }}
        />
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="dk-verification-review" role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading verification case…</span>
      <SkeletonBone variant="text-sm" style={{ width: 160, marginBottom: 16 }} />

      <div className="dk-verification-hero" aria-hidden="true">
        <div className="dk-verification-identity" style={{ width: "70%" }}>
          <SkeletonBone style={{ width: 58, height: 58, borderRadius: 16, flexShrink: 0 }} />
          <div className="dk-skeleton-header__left">
            <SkeletonBone variant="title" style={{ width: "58%" }} />
            <SkeletonBone variant="text-sm" style={{ width: "72%" }} />
          </div>
        </div>
        <div className="dk-stack" style={{ alignItems: "flex-end", gap: 7 }}>
          <SkeletonBone variant="badge" />
          <SkeletonBone variant="text-sm" style={{ width: 150 }} />
        </div>
      </div>

      <div className="dk-verification-summary" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index}>
            <SkeletonBone variant="text-sm" style={{ width: "65%", marginBottom: 7 }} />
            <SkeletonBone variant="text" style={{ width: "42%" }} />
          </div>
        ))}
      </div>

      <div className="dk-verification-workspace">
        <div className="dk-verification-main">
          <VerificationSectionSkeleton rows={4} />
          <VerificationSectionSkeleton rows={3} />
        </div>
        <aside className="dk-verification-sidebar" aria-hidden="true">
          <div className="dk-verification-sidebar-card">
            <div className="dk-verification-sidebar-block dk-stack">
              <SkeletonBone variant="title" style={{ width: "62%" }} />
              <SkeletonBone variant="text" style={{ width: "92%" }} />
              <SkeletonBone variant="text" style={{ width: "82%" }} />
              <SkeletonBone variant="text" style={{ width: "76%" }} />
            </div>
            <div className="dk-verification-sidebar-block dk-stack">
              <SkeletonBone variant="title" style={{ width: "68%" }} />
              <SkeletonBone variant="text" style={{ width: "90%" }} />
              <SkeletonBone variant="btn" style={{ width: "100%" }} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
