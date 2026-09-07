import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton, RestrictedCaseNotice } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CaseHistoryList } from "@/components/ui/CaseHistoryList";
import { EvidenceList } from "@/components/ui/EvidenceList";
import { ReportActionsPanel } from "./ReportActionsPanel";
import { CaseSubjectCard } from "@/components/ui/CaseSubjectCard";
import { reportStatusLabel, reportStatusTone } from "../status";

/** `task`, `message` etc. are lowercase database values, not display labels. */
function resourceTypeLabel(resourceType: string): string {
  return resourceType.replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export const metadata: Metadata = { title: "Report" };

/**
 * Report case review.
 *
 * The whole body is one record, so the shell shown without waiting is
 * deliberately small: the breadcrumb trail is the operator's proof they are on
 * the right page and their route back to the queue while the record is slow, so
 * it is returned immediately and the record streams in behind its own boundary.
 *
 * The final breadcrumb is a static label rather than the report reference: the
 * reference is already the page's `h1`, so repeating it bought nothing and would
 * have held the whole trail back until the query returned.
 */
export default async function ReportDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Reports", href: "/reports" },
          { label: "Case review" },
        ]}
      />
      <Suspense fallback={<DetailRegionSkeleton cards={4} lines={4} />}>
        <ReportCaseRecord caseId={id} actor={session.email} />
      </Suspense>
    </>
  );
}

async function ReportCaseRecord({
  caseId,
  actor,
}: {
  readonly caseId: string;
  readonly actor: string;
}) {
  const repository = getAdminRepository();
  const detail = await repository.getReport({ reportId: caseId, actor });

  if (!detail) {
    notFound();
  }

  return (
    <div className="dk-detail">
      <header className="dk-detail-header">
        <div className="dk-detail-header-main">
          <h1>
            {resourceTypeLabel(detail.resourceType)} report · {detail.category}
          </h1>
          <StatusBadge
            tone={reportStatusTone(detail.status)}
            label={reportStatusLabel(detail.status)}
          />
        </div>
        <dl className="dk-detail-header-meta">
          <div className="dk-fact">
            <dt>Reported by</dt>
            <dd>{detail.reporterDisplayName}</dd>
          </div>
          <div className="dk-fact">
            <dt>Reported at</dt>
            <dd>
              <time dateTime={detail.createdAt}>{formatDateTime(detail.createdAt)}</time>
            </dd>
          </div>
          <div className="dk-fact">
            <dt>Report reference</dt>
            <dd>
              <code>{detail.id}</code>
            </dd>
          </div>
        </dl>
      </header>

      <div className="dk-card">
        <h2>Assignment</h2>
        <p>
          <strong>Assignee:</strong> {detail.assignee ?? "Unassigned"}
        </p>
        <ReportActionsPanel
          reportId={detail.id}
          status={detail.status}
          assignee={detail.assignee}
          actor={actor}
        />
      </div>

      {detail.access.restricted ? (
        <div className="dk-card">
          <RestrictedCaseNotice reason={detail.access.reason} />
        </div>
      ) : (
        <>
          <CaseSubjectCard subject={detail.subject} />

          {detail.triage ? (
            <div className="dk-card">
              <h2>Reporter and volume</h2>
              <dl className="dk-fact-grid">
                <dt>Reporter</dt>
                <dd>
                  <AppLink href={`/users/${detail.triage.reporter.id}`}>
                    {detail.triage.reporter.displayName}
                  </AppLink>{" "}
                  ({detail.triage.reporter.accountStatus})
                </dd>
                <dt>Reports filed by this user</dt>
                <dd>
                  {detail.triage.reporter.reportsFiled} total,{" "}
                  {detail.triage.reporter.reportsDismissed} dismissed
                </dd>
                <dt>Distinct reporters on this resource</dt>
                <dd>{detail.triage.distinctReporters}</dd>
                <dt>Open cases on this resource</dt>
                <dd>{detail.triage.openCases}</dd>
                <dt>Previously actioned</dt>
                <dd>{detail.triage.actionedCases}</dd>
              </dl>
              <p className="dk-muted">
                Counts only. Who else reported this resource is not disclosed — how many did is what
                distinguishes a single complaint from a coordinated one.
              </p>
            </div>
          ) : null}

          <div className="dk-card">
            <h2>Subject</h2>
            <p>{detail.caseSubject.resourceLabel}</p>
            <h3>Narrative</h3>
            <p>{detail.narrative}</p>
          </div>

          <div className="dk-card">
            <h2>Evidence</h2>
            <p className="dk-muted">
              Attachment names only. The files themselves stay in private storage and require an
              authorized signed URL, so nothing is rendered from a raw storage path here.
            </p>
            <EvidenceList items={detail.evidence} />
          </div>

          <div className="dk-card">
            <h2>History</h2>
            <CaseHistoryList events={detail.history} statusLabel={reportStatusLabel} />
          </div>
        </>
      )}
    </div>
  );
}


