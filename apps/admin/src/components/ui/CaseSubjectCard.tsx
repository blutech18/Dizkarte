import Link from "next/link";
import { Fragment } from "react";
import { formatPhp } from "@dizkarte/domain";
import type { CaseSubject } from "@/lib/repository/types";

/**
 * Renders what an Admin case is about, from the live-resolved subject
 * (`admin_read_report_subject` / `admin_read_dispute_subject`, migration 0049).
 *
 * Shared by the report and dispute detail pages so both describe a subject the
 * same way. Before this existed, both pages could only print the resource type
 * and eight characters of a UUID, which is not enough to decide anything.
 *
 * Three states, all of them normal:
 *  - `subject === null` — the viewer is not the assigned Admin, so nothing is
 *    resolved (assignment gates sensitive detail);
 *  - `exists: false` — the content was deleted after the case was filed;
 *  - resolved — details plus, where applicable, the text under review.
 */
export function CaseSubjectCard({
  subject,
  title = "Reported content",
  emptyNote,
}: {
  readonly subject: CaseSubject | null;
  readonly title?: string;
  readonly emptyNote?: string;
}) {
  return (
    <div className="dk-card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {subject === null ? (
        <p className="dk-muted">
          {emptyNote ?? "Assign this case to yourself to see the content it refers to."}
        </p>
      ) : (
        <>
          <p>
            <strong>{subject.label}</strong>
          </p>
          {subject.exists ? (
            <>
              <dl>
                {subject.subjectUserName ? (
                  <>
                    <dt>Responsible party</dt>
                    <dd>
                      {subject.subjectUserId ? (
                        <Link href={`/users/${subject.subjectUserId}`}>
                          {subject.subjectUserName}
                        </Link>
                      ) : (
                        subject.subjectUserName
                      )}
                    </dd>
                  </>
                ) : null}
                {subject.counterpartyName ? (
                  <>
                    <dt>Other party</dt>
                    <dd>{subject.counterpartyName}</dd>
                  </>
                ) : null}
                {subject.status ? (
                  <>
                    <dt>Current state</dt>
                    <dd>{subject.status}</dd>
                  </>
                ) : null}
                {subject.amountCentavos !== null ? (
                  <>
                    <dt>Amount</dt>
                    <dd>{formatPhp(subject.amountCentavos)}</dd>
                  </>
                ) : null}
                {subject.occurredAt ? (
                  <>
                    <dt>Created</dt>
                    <dd>{new Date(subject.occurredAt).toLocaleString("en-PH")}</dd>
                  </>
                ) : null}
                {subject.bookingId ? (
                  <>
                    <dt>Booking</dt>
                    <dd>
                      <Link href={`/bookings/${subject.bookingId}`}>
                        {subject.taskTitle ?? "Open booking"}
                      </Link>
                    </dd>
                  </>
                ) : null}
                {Object.entries(subject.extra).map(([key, value]) => (
                  <Fragment key={key}>
                    <dt>{humanizeKey(key)}</dt>
                    <dd>{formatExtraValue(value)}</dd>
                  </Fragment>
                ))}
              </dl>
              {subject.body ? (
                <>
                  <h3>Content under review</h3>
                  {/* Verbatim. Paraphrasing the words being moderated would defeat
                      the purpose of the review. */}
                  <blockquote className="dk-quote">{subject.body}</blockquote>
                </>
              ) : null}
            </>
          ) : (
            <p className="dk-muted">
              This content no longer exists — it was removed after the case was filed. The case can
              still be decided from the narrative, evidence, and history below.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** `categoryName` -> `Category name`. Keeps the resolver free to add fields. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * `null` is rendered as "Not recorded" rather than a blank cell: an empty value
 * next to a label reads as a rendering bug, and worse, as a zero.
 */
function formatExtraValue(value: string | number | boolean | null): string {
  if (value === null) return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
