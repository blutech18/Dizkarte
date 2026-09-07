import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import type { AdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CaseHistoryList } from "@/components/ui/CaseHistoryList";
import { EvidenceList } from "@/components/ui/EvidenceList";
import { RestrictedCaseNotice, DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { SupportActionsPanel } from "./SupportActionsPanel";
import { ticketStatusLabel, ticketStatusTone } from "../status";

export const metadata: Metadata = { title: "Support ticket" };

/**
 * Support ticket detail.
 *
 * Everything below the breadcrumb is a single ticket record — assignment,
 * subject, evidence, and history all come from one `getTicket` read gated by the
 * viewing Admin — so the trail paints immediately and the record streams in
 * behind one Suspense boundary. There is a single boundary because the whole body
 * depends on that one record.
 *
 * The final crumb shows the ticket id taken from the route params rather than the
 * fetched record: the value is identical, so sourcing it from the params keeps the
 * trail from waiting on the query without changing what the operator reads.
 */
export default async function SupportTicketDetailPage({
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
          { label: "Support tickets", href: "/support" },
          { label: id },
        ]}
      />
      <Suspense fallback={<DetailRegionSkeleton cards={4} lines={3} />}>
        <SupportTicketRecord id={id} session={session} />
      </Suspense>
    </>
  );
}

async function SupportTicketRecord({
  id,
  session,
}: {
  readonly id: string;
  readonly session: AdminSession;
}) {
  const repository = getAdminRepository();
  const detail = await repository.getTicket({ ticketId: id, actor: session.email });

  if (!detail) {
    notFound();
  }

  return (
    <div className="dk-detail">
      <header className="dk-detail-header">
        <div className="dk-detail-header-main">
          <h1>{detail.subject}</h1>
          <StatusBadge
            tone={ticketStatusTone(detail.status)}
            label={ticketStatusLabel(detail.status)}
          />
        </div>
        <dl className="dk-detail-header-meta">
          <div className="dk-fact">
            <dt>Requested by</dt>
            <dd>{detail.requesterDisplayName}</dd>
          </div>
          <div className="dk-fact">
            <dt>Category</dt>
            <dd>{detail.category}</dd>
          </div>
          <div className="dk-fact">
            <dt>Last updated</dt>
            <dd>
              <time dateTime={detail.updatedAt}>{formatDateTime(detail.updatedAt)}</time>
            </dd>
          </div>
          <div className="dk-fact">
            <dt>Ticket reference</dt>
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
        <SupportActionsPanel
          ticketId={detail.id}
          status={detail.status}
          assignee={detail.assignee}
          actor={session.email}
        />
      </div>

      {detail.access.restricted ? (
        <div className="dk-card">
          <RestrictedCaseNotice reason={detail.access.reason} />
        </div>
      ) : (
        <>
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
            <CaseHistoryList events={detail.history} statusLabel={ticketStatusLabel} />
          </div>
        </>
      )}
    </div>
  );
}

