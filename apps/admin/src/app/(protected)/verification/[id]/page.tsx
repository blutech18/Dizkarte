import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  verificationDecisionsFor,
  verificationStatusLabel,
  verificationStatusTone,
} from "../status";
import { VerificationDecisionPanel } from "./VerificationDecisionPanel";

export const metadata: Metadata = { title: "Verification case" };

function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h6" />
    </svg>
  );
}

function LockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect width="18" height="12" x="3" y="10" rx="2" />
      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "V"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function documentLabel(kind: string): string {
  return kind
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function unavailableDecisionMessage(status: string): string {
  if (status === "RESUBMISSION_REQUIRED") {
    return "The applicant must submit corrected documents before another decision can be made.";
  }
  return "This case already has a final decision. No further action is available.";
}

/**
 * Verification case review.
 *
 * Almost everything on this page is one record, so the shell that can be shown
 * without waiting is deliberately small: the breadcrumb trail and the way back
 * to the queue. Those are exactly what an operator needs if the record is slow —
 * proof they are on the right page, and an escape hatch — so they are returned
 * immediately and the record streams in behind its own boundary.
 *
 * The final breadcrumb is a static label rather than the applicant's name: the
 * name is already the page's `h1`, so repeating it bought nothing and would have
 * held the whole trail back until the query returned.
 */
export default async function VerificationDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;

  return (
    <div className="dk-verification-review">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Identity verification", href: "/verification" },
          { label: "Case review" },
        ]}
      />

      <AppLink className="dk-verification-back" href="/verification">
        <ArrowLeftIcon width={17} height={17} aria-hidden="true" />
        Back to verification queue
      </AppLink>

      <Suspense fallback={<DetailRegionSkeleton cards={3} lines={4} />}>
        <VerificationCaseRecord caseId={id} />
      </Suspense>
    </div>
  );
}

async function VerificationCaseRecord({ caseId }: { readonly caseId: string }) {
  const detail = await getAdminRepository().getVerificationCase(caseId);
  if (!detail) notFound();

  const decisions = verificationDecisionsFor(detail.status);
  const documentCount = detail.documents.length;

  return (
    <>
      <header className="dk-verification-hero">
        <div className="dk-verification-identity">
          <div className="dk-verification-avatar" aria-hidden="true">
            {initials(detail.userDisplayName)}
          </div>
          <div className="dk-verification-identity-copy">
            <h1>{detail.userDisplayName}</h1>
          </div>
        </div>
        <div className="dk-verification-hero-status">
          <StatusBadge
            tone={verificationStatusTone(detail.status)}
            label={verificationStatusLabel(detail.status)}
          />
          <p>
            <span>Submitted</span>
            <time dateTime={detail.submittedAt}>{formatDateTime(detail.submittedAt)}</time>
          </p>
        </div>
      </header>

      <dl className="dk-verification-summary" aria-label="Verification case summary">
        <div>
          <dt>Documents</dt>
          <dd>{documentCount}</dd>
        </div>
        <div>
          <dt>Assigned to</dt>
          <dd>{detail.assignedAdminName ?? "Unassigned"}</dd>
        </div>
        <div>
          <dt>Case events</dt>
          <dd>{detail.history.length}</dd>
        </div>
      </dl>

      <div className="dk-verification-workspace">
        <main className="dk-verification-main" aria-label="Verification evidence">
          <section className="dk-verification-section" aria-labelledby="documents-title">
            <div className="dk-verification-section-heading">
              <h2 id="documents-title">Submitted documents</h2>
            </div>

            <div className="dk-verification-review-note">
              <div className="dk-verification-review-note-heading">
                <LockIcon width={18} height={18} aria-hidden="true" />
                <strong>Manual document review</strong>
              </div>
              <p>
                No automated identity decision is performed. Document metadata is authorized for
                this Admin review and object access remains separately controlled.
              </p>
            </div>

            {detail.documents.length === 0 ? (
              <div className="dk-verification-empty">
                <strong>No documents available</strong>
                <p>No document metadata is available to this reviewer for the current case.</p>
              </div>
            ) : (
              <ul className="dk-verification-document-list">
                {detail.documents.map((document) => (
                  <li key={document.kind}>
                    <div className="dk-verification-document-heading">
                      <DocumentIcon width={20} height={20} aria-hidden="true" />
                      <strong>{documentLabel(document.kind)}</strong>
                    </div>
                    <p>{document.signedUrlPreview}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dk-verification-section" aria-labelledby="history-title">
            <div className="dk-verification-section-heading">
              <h2 id="history-title">Case history</h2>
            </div>

            {detail.history.length === 0 ? (
              <div className="dk-verification-empty">
                <strong>No case events available</strong>
                <p>Decision activity is recorded separately in the Admin audit trail.</p>
              </div>
            ) : (
              <ol className="dk-verification-timeline">
                {detail.history.map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <span className="dk-verification-timeline-marker" aria-hidden="true" />
                    <div className="dk-verification-timeline-content">
                      <div className="dk-verification-timeline-heading">
                        <strong>
                          {verificationStatusLabel(event.fromStatus)} →{" "}
                          {verificationStatusLabel(event.toStatus)}
                        </strong>
                        <time dateTime={event.at}>{formatDateTime(event.at)}</time>
                      </div>
                      <p>Changed by {event.actor}</p>
                      {event.reason ? <blockquote>{event.reason}</blockquote> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </main>

        <aside className="dk-verification-sidebar" aria-label="Verification decision">
          <div className="dk-verification-sidebar-card">
            <div className="dk-verification-sidebar-block">
              <h2>Review context</h2>
              <dl className="dk-verification-context-list">
                <div>
                  <dt>Documents received</dt>
                  <dd>{documentCount}</dd>
                </div>
                <div>
                  <dt>Decision method</dt>
                  <dd>Manual review</dd>
                </div>
                <div>
                  <dt>Automated decision</dt>
                  <dd>None</dd>
                </div>
              </dl>
            </div>

            <div className="dk-verification-sidebar-block">
              <h2>{decisions.length > 0 ? "Make a decision" : "Decision"}</h2>
              {decisions.length === 0 ? (
                <p className="dk-verification-sidebar-help">
                  {unavailableDecisionMessage(detail.status)}
                </p>
              ) : (
                <>
                  <p className="dk-verification-sidebar-help">
                    A written reason is required and recorded against your Admin account.
                  </p>
                  <VerificationDecisionPanel caseId={detail.id} currentStatus={detail.status} />
                </>
              )}
            </div>

            <div className="dk-verification-reference">
              <div>
                <span>Case reference</span>
                <code>{detail.id}</code>
              </div>
              <div>
                <span>User reference</span>
                <code>{detail.userId}</code>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
