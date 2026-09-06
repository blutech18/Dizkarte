import { AppLink } from "@/components/ui/AppLink";
import { Breadcrumbs } from "@/components/ui/Field";
import { VerificationRecordSkeleton } from "./VerificationSkeleton";

function ArrowLeftIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export default function Loading() {
  return (
    <div className="dk-detail" role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading verification case…</span>
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Identity verification", href: "/verification" },
            { label: "Case review" },
          ]}
        />
        <AppLink className="dk-back-btn" href="/verification">
          <ArrowLeftIcon />
          <span>Back to verification queue</span>
        </AppLink>
      </nav>

      <VerificationRecordSkeleton />
    </div>
  );
}
