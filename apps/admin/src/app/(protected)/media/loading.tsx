import { SkeletonBone, SkeletonMediaGrid } from "@/components/ui/AsyncState";

/**
 * The media queue is a gallery, not a table, so the generic list skeleton was
 * showing table rows that were then replaced by image cards - the layout jumped
 * on every load. The gallery shape lives in `SkeletonMediaGrid` so this route
 * skeleton and the page's own streaming fallback cannot drift apart.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading task media.</span>

      <div aria-hidden="true">
        <SkeletonBone variant="title" style={{ width: 220 }} />
        <SkeletonBone variant="subtitle" style={{ width: "70%", marginTop: 10 }} />
      </div>

      <div className="dk-filter-bar" aria-hidden="true">
        <SkeletonBone variant="btn" style={{ width: 260 }} />
        <SkeletonBone variant="btn" style={{ width: 190 }} />
      </div>

      <SkeletonMediaGrid />
    </div>
  );
}

