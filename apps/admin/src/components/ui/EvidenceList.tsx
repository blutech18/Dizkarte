import type { EvidenceMetadata } from "@/lib/repository/types";

/**
 * Evidence attached to a report, dispute, or ticket.
 *
 * Shared by all three case detail pages, which previously each carried their own
 * copy of this markup and drifted.
 *
 * Attachments are listed by file name only. The bytes are not rendered here and
 * cannot be: every media bucket is private, and an assigned Admin must go
 * through `admin_authorize_object_read` to obtain a signed URL. Notes are shown
 * in full because the submitter typed them for the reviewer to read.
 */
export function EvidenceList({ items }: { readonly items: ReadonlyArray<EvidenceMetadata> }) {
  if (items.length === 0) {
    return <p className="dk-muted">No evidence was attached.</p>;
  }

  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${item.kind}-${index}`}>
          {item.kind === "note" ? (
            <>Note: {item.note}</>
          ) : (
            <>
              Attachment <code>{item.fileName}</code>
            </>
          )}{" "}
          — submitted {new Date(item.submittedAt).toLocaleString("en-PH")}
        </li>
      ))}
    </ul>
  );
}
