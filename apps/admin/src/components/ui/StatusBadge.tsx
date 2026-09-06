import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "error" | "info" | "client";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "dk-badge-neutral",
  brand: "dk-badge-brand",
  success: "dk-badge-success",
  warning: "dk-badge-warning",
  error: "dk-badge-error",
  info: "dk-badge-info",
  client: "dk-badge-client",
};

export type StatusBadgeProps = {
  readonly tone: BadgeTone;
  readonly label: string;
  readonly icon?: ReactNode;
};

/**
 * Status badge that always renders literal text — never color alone conveys
 * meaning (requirement R14 / brand system section 6).
 */
export function StatusBadge({ tone, label, icon }: StatusBadgeProps) {
  return (
    <span className={`dk-badge ${TONE_CLASS[tone]}`}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </span>
  );
}
