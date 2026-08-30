import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton, RestrictedCaseNotice } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CaseHistoryList } from "@/components/ui/CaseHistoryList";
import { paymentStatusLabel } from "../../payments/status";
import { EvidenceList } from "@/components/ui/EvidenceList";
import { CaseActionsPanel } from "@/components/ui/CaseActionsPanel";
import { CaseSubjectCard } from "@/components/ui/CaseSubjectCard";
import { PaymentActionsPanel } from "../../payments/PaymentActionsPanel";
import { ConversationPanel } from "../ConversationPanel";
import {
  DISPUTE_STATUS_TRANSITIONS,
  disputeStatusLabel,
  disputeStatusMeaning,
  disputeStatusTone,
} from "../status";
import { assignDisputeAction, transitionDisputeStatusAction } from "../actions";

export const metadata: Metadata = { title: "Dispute" };

/**
 * Dispute case review.
 *
 * The shell that can be shown without waiting is small: the breadcrumb trail is
 * the operator's proof they are on the right page and their route back to the
 * queue while the record is slow, so it is returned immediately and the record
 * streams in behind its own boundary.
 *
 * The final breadcrumb is a static label rather than the dispute reference: the
 * reference is already the page's `h1`, so repeating it bought nothing and would
 * have held the whole trail back until the query returned.
 *
 * One boundary, not several: the linked-payment lookup is keyed by the dispute's
 * booking, so it cannot start until the dispute has loaded, and the provider
 * availability shown beside it only ever renders inside that same payment card.
 * Chaining them under one boundary matches how they actually depend on each other.
 */
export default async function DisputeDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_FINANCE"]);
  const { id } = await params;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Disputes", href: "/disputes" },
          { label: "Case review" },
        ]}
      />
      <Suspense fallback={<DetailRegionSkeleton cards={4} lines={4} />}>
        <DisputeCaseRecord caseId={id} actor={session.email} />
      </Suspense>
    </>
  );
}

async function DisputeCaseRecord({
  caseId,
  actor,
}: {
  readonly caseId: string;
  readonly actor: string;
}) {
  const repository = getAdminRepository();
  const [detail, availability] = await Promise.all([
    repository.getDispute({ disputeId: caseId, actor }),
    repository.getFinanceProviderAvailability(),
  ]);

  if (!detail) {
    notFound();
  }

  const linkedPaymentIntent = await repository.getPaymentIntentByBooking(detail.bookingId);
  const isAssignedToMe = detail.assignee === actor;
  const allowedTransitions = DISPUTE_STATUS_TRANSITIONS[detail.status] ?? [];

  return (
    <div className="dk-detail">
      <header className="dk-detail-header">
        <div className="dk-detail-header-main">
          <h1>Dispute on booking {detail.bookingId}</h1>
          <StatusBadge
            tone={disputeStatusTone(detail.status)}
            label={disputeStatusLabel(detail.status)}
          />
        </div>
        <p className="dk-detail-header-meaning">{disputeStatusMeaning(detail.status)}</p>
        <dl className="dk-detail-header-meta">
          <div className="dk-fact">
            <dt>Disputed amount</dt>
            <dd>{formatPhp(detail.amountCentavos)}</dd>
          </div>
          <div className="dk-fact">
            <dt>Opened</dt>
            <dd>
              <time dateTime={detail.openedAt}>{formatDateTime(detail.openedAt)}</time>
            </dd>
          </div>
          <div className="dk-fact">
            <dt>Dispute reference</dt>
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
        <p className="dk-muted">
          Freezing affected financial activity never rewrites ledger history. Amounts shown are
          booking totals, not raw provider payloads.
        </p>
        <CaseActionsPanel
          isAssignedToMe={isAssignedToMe}
          isUnassigned={detail.assignee === null}
          assignLabel="Assign to me"
          onAssign={() => assignDisputeAction({ disputeId: detail.id })}
          allowedTransitions={allowedTransitions}
          transitionLabel={disputeStatusLabel}
          onTransition={(toStatus, reason) =>
            transitionDisputeStatusAction({
              disputeId: detail.id,
              toStatus: toStatus as "UNDER_REVIEW" | "RESOLVED" | "REJECTED" | "CANCELLED",
              reason,
            })
          }
        />
      </div>

      {linkedPaymentIntent ? (
        <div className="dk-card">
          <h2>Linked payment</h2>
          <p>
            Payment{" "}
            <AppLink href={`/payments/${linkedPaymentIntent.id}`}>{linkedPaymentIntent.id}</AppLink>{" "}
            · {formatPhp(linkedPaymentIntent.amountCentavos)} · {paymentStatusLabel(linkedPaymentIntent.status)}
          </p>
          <p className="dk-muted">{availability.reason}</p>
          <PaymentActionsPanel
            paymentIntentId={linkedPaymentIntent.id}
            freezeEligible={
              linkedPaymentIntent.status === "PROTECTED" ||
              linkedPaymentIntent.status === "CAPTURED"
            }
            refundDisabledReason={availability.reason}
          />
        </div>
      ) : null}

      {detail.access.restricted ? (
        <div className="dk-card">
          <RestrictedCaseNotice reason={detail.access.reason} />
        </div>
      ) : (
        <>
          <CaseSubjectCard subject={detail.subject} title="Disputed booking" />

          <div className="dk-card">
            <h2>Narrative</h2>
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
            <h2>Booking conversation</h2>
            <ConversationPanel disputeId={detail.id} disabled={!isAssignedToMe} />
          </div>

          <div className="dk-card">
            <h2>History</h2>
            <CaseHistoryList events={detail.history} statusLabel={disputeStatusLabel} />
          </div>
        </>
      )}
    </div>
  );
}


