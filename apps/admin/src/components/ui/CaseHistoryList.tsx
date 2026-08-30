import { formatDateTime } from "@/lib/datetime";
import type { CaseHistoryEvent } from "@/lib/repository/types";

/**
 * Audited change log for a case (report, ticket, dispute, payment).
 *
 * Replaces a seven-column table that each case page carried its own copy of.
 * That table overflowed on a phone, and it printed raw database vocabulary —
 * `status_changed`, `OPEN` → `TRIAGED`, `ADMIN_SUPPORT` — in the narrowest cells,
 * with the reason (the part that explains the decision) squeezed hardest.
 */

/** `status`/`assignment` are field names in the database, not sentences. */
export function caseEventLabel(type: string): string {
  switch (type) {
    case "status":
      return "Status changed";
    case "assignment":
      return "Assignment changed";
    default:
      return type.replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
  }
}

export type CaseHistoryListProps = {
  readonly events: ReadonlyArray<CaseHistoryEvent>;
  /** Maps a status enum to plain language, e.g. `reportStatusLabel`. */
  readonly statusLabel?: (status: string) => string;
  readonly emptyText?: string;
};

export function CaseHistoryList({
  events,
  statusLabel = (status) => status,
  emptyText = "No change recorded for this case yet.",
}: CaseHistoryListProps) {
  if (events.length === 0) {
    return <p className="dk-muted">{emptyText}</p>;
  }

  return (
    <ul className="dk-history">
      {events.map((event, index) => {
        /*
          Only a status event carries status enums. An assignment event's values
          are Admin identities, so passing them through a status label would
          garble them.
        */
        const isStatus = event.type === "status";
        const from = event.fromValue
          ? isStatus
            ? statusLabel(event.fromValue)
            : event.fromValue
          : null;
        const to = event.toValue ? (isStatus ? statusLabel(event.toValue) : event.toValue) : null;
        const transition = to ? (from ? `${from} → ${to}` : to) : null;

        return (
          <li key={`${event.type}-${event.at}-${index}`}>
            <div className="dk-history-head">
              <strong>{caseEventLabel(event.type)}</strong>
              <time className="dk-history-time" dateTime={event.at}>
                {formatDateTime(event.at)}
              </time>
            </div>
            <p className="dk-history-meta">
              {transition ? `${transition} · ` : ""}
              {event.actor}
              {event.capability ? ` · ${event.capability}` : ""}
            </p>
            {/* Verbatim Admin-entered reason, quoted so it reads as their words. */}
            {event.reason ? <blockquote className="dk-quote">{event.reason}</blockquote> : null}
          </li>
        );
      })}
    </ul>
  );
}
