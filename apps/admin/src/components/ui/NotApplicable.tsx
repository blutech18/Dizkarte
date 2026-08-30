/**
 * Table cell for a value that does not apply to this row.
 *
 * An em dash alone is announced inconsistently by screen readers (and sometimes
 * skipped entirely), so the dash is decorative and the meaning is carried by
 * text. Used wherever a column is only meaningful for part of the queue, e.g.
 * time-waiting on a case that already has a final decision.
 */
export function NotApplicable() {
  return (
    <>
      <span aria-hidden="true" className="dk-muted">
        —
      </span>
      <span className="dk-visually-hidden">Not applicable</span>
    </>
  );
}
