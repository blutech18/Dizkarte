"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function DashboardRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="dk-btn dk-btn-secondary dk-dashboard-refresh"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      <svg
        aria-hidden="true"
        className={
          isPending ? "dk-dashboard-refresh-icon is-spinning" : "dk-dashboard-refresh-icon"
        }
        fill="none"
        height="16"
        viewBox="0 0 24 24"
        width="16"
      >
        <path
          d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
      {isPending ? "Refreshing…" : "Refresh data"}
    </button>
  );
}
