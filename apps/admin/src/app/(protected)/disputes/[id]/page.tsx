import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { CaseHistoryList } from "@/components/ui/CaseHistoryList";
import { paymentStatusLabel } from "../../payments/status";
import { EvidenceList } from "@/components/ui/EvidenceList";
import { DisputeActionsPanel } from "./DisputeActionsPanel";
import { CaseSubjectCard } from "@/components/ui/CaseSubjectCard";
import { PaymentActionsPanel } from "../../payments/PaymentActionsPanel";
import { ConversationPanel } from "../ConversationPanel";
import {
  disputeStatusLabel,
  disputeStatusMeaning,
  disputeStatusTone,
} from "../status";

export const metadata: Metadata = { title: "Dispute" };

function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Dispute case review.
 *
 * Clean, minimal workstation layout for finance operators. When unassigned,
 * presents an integrated assignment card explaining data protection rules
 * and the materials held under dispute review.
 */
export default async function DisputeDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_FINANCE"]);
  const { id } = await params;

  return (
    <div className="dk-detail">
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Disputes", href: "/disputes" },
            { label: "Case review" },
          ]}
        />
        <AppLink href="/disputes" className="dk-back-btn">
          <ArrowLeftIcon />
          <span>Back to disputes</span>
        </AppLink>
      </nav>
      <Suspense fallback={<DetailRegionSkeleton cards={4} lines={4} />}>
        <DisputeCaseRecord caseId={id} actor={session.email} />
      </Suspense>
    </div>
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
  const isAssigned = detail.assignee !== null;

  return (
    <>
      {/* Header Summary */}
      <header className="dk-report-hero">
        <div className="dk-report-hero-head">
          <div>
            <h1 className="dk-report-hero-title">
              Dispute on booking {detail.bookingId}
            </h1>
            <p className="dk-report-hero-meaning">
              {disputeStatusMeaning(detail.status)}
            </p>
          </div>
          <div style={{ flexShrink: 0 }}>
            <StatusBadge
              tone={disputeStatusTone(detail.status)}
              label={disputeStatusLabel(detail.status)}
            />
          </div>
        </div>

        {/* Key Metrics */}
        <dl className="dk-report-metrics">
          <Fact label="Dispute reference">
            <span className="dk-ref-code" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
              {formatReferenceId(detail.id, "DSP", detail.openedAt)}
            </span>
            <CopyButton text={detail.id} label="dispute reference ID" variant="icon" />
          </Fact>
          <Fact label="Disputed booking">
            <AppLink
              href={`/bookings/${detail.bookingId}`}
              className="dk-ref-code"
              style={{ fontSize: 13, whiteSpace: "nowrap" }}
            >
              {formatReferenceId(detail.bookingId, "BK")}
            </AppLink>
            <CopyButton text={detail.bookingId} label="booking ID" variant="icon" />
          </Fact>
          <Fact label="Disputed amount">
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatPhp(detail.amountCentavos)}
            </span>
          </Fact>
          <Fact label="Opened at">
            <time dateTime={detail.openedAt}>{formatDateTime(detail.openedAt)}</time>
          </Fact>
          <Fact label="Assignee">
            <span style={{ color: isAssigned ? "var(--dk-textPrimary)" : "var(--dk-textSecondary)" }}>
              {detail.assignee ?? "Unassigned"}
            </span>
          </Fact>
        </dl>
      </header>

      {/* Case Content */}
      {detail.access.restricted ? (
        <section className="dk-report-lock-card" aria-label="Access Restricted">
          <div>
            <h2 className="dk-report-lock-title">
              {detail.access.reason === "unassigned"
                ? "Case Assignment Required"
                : "Assigned to Another Finance Admin"}
            </h2>
            <p className="dk-report-lock-desc">
              {detail.access.reason === "unassigned"
                ? "To maintain customer confidentiality, financial audit integrity, and prevent conflicting settlements, dispute narratives, evidence attachments, and booking conversations are restricted until claimed by a finance admin."
                : `This dispute is currently assigned to ${detail.assignee ?? "another finance admin"}. Sensitive narrative details, evidence files, and resolution actions are restricted to the active assignee.`}
            </p>
          </div>

          <div className="dk-report-lock-action-bar">
            <div className="dk-report-lock-assignee">
              <span className="dk-report-lock-assignee-label">Assignee:</span>
              <span className="dk-report-lock-assignee-value">
                {detail.assignee ? detail.assignee : "Unassigned"}
              </span>
            </div>
            <div>
              <DisputeActionsPanel
                disputeId={detail.id}
                status={detail.status}
                assignee={detail.assignee}
                actor={actor}
              />
            </div>
          </div>

          <div className="dk-report-lock-preview">
            <h3 className="dk-report-lock-preview-title">Protected Information in this Dispute</h3>
            <p className="dk-report-lock-preview-sub">
              {detail.access.reason === "unassigned"
                ? "Assign this dispute to yourself to inspect and action the following materials:"
                : "The following items are restricted to the active case assignee:"}
            </p>
            <div className="dk-report-locked-grid">
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Dispute Claim & Narrative</span>
                <p>Full incident description and dispute claims submitted by the party.</p>
              </div>
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Evidence & File Attachments</span>
                <p>Private object storage uploads, receipts, and supporting notes.</p>
              </div>
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Booking Conversation</span>
                <p>Private on-demand transcript of client and tasker chat messages.</p>
              </div>
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Resolution & Settlement</span>
                <p>Financial dispute settlement transitions and payout adjustments.</p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="dk-report-grid">
          {/* Main Column */}
          <div className="dk-report-main">
            {/* Disputed Booking Subject */}
            <CaseSubjectCard subject={detail.subject} title="Disputed booking" />

            {/* Narrative */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Dispute narrative</h2>
                <span className="dk-badge dk-badge-neutral">
                  Booking {formatReferenceId(detail.bookingId, "BK")}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--dk-textSecondary)" }}>
                <strong>Dispute reference:</strong> {formatReferenceId(detail.id, "DSP", detail.openedAt)}
              </p>
              {detail.narrative ? (
                <div className="dk-report-narrative-box">
                  {detail.narrative}
                </div>
              ) : (
                <p className="dk-muted" style={{ marginTop: 12 }}>
                  No additional written narrative was provided with this dispute.
                </p>
              )}
            </div>

            {/* Evidence */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Evidence & attachments</h2>
                <span className="dk-badge dk-badge-neutral">
                  {detail.evidence.length} {detail.evidence.length === 1 ? "file" : "files"}
                </span>
              </div>
              <p className="dk-muted" style={{ marginTop: 0, marginBottom: 14, fontSize: 13 }}>
                Attachment names only. The files themselves stay in private storage and require an
                authorized signed URL.
              </p>
              <EvidenceList items={detail.evidence} />
            </div>

            {/* Booking Conversation */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Booking conversation</h2>
                <span className="dk-badge dk-badge-neutral">Audit logged</span>
              </div>
              <ConversationPanel disputeId={detail.id} disabled={!isAssignedToMe} />
            </div>

            {/* History */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Case history</h2>
                <span className="dk-badge dk-badge-neutral">
                  {detail.history.length} {detail.history.length === 1 ? "event" : "events"}
                </span>
              </div>
              <CaseHistoryList events={detail.history} statusLabel={disputeStatusLabel} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="dk-report-sidebar">
            {/* Financial Dispute Actions */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Dispute actions</h2>
                <StatusBadge
                  tone={disputeStatusTone(detail.status)}
                  label={disputeStatusLabel(detail.status)}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <p style={{ margin: "0 0 4px 0", fontSize: 11, fontWeight: 600, color: "var(--dk-textSecondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Assignee
                </p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dk-textPrimary)" }}>
                  {detail.assignee ?? "Unassigned"}
                </p>
              </div>
              <DisputeActionsPanel
                disputeId={detail.id}
                status={detail.status}
                assignee={detail.assignee}
                actor={actor}
              />
            </div>

            {/* Linked Payment */}
            {linkedPaymentIntent ? (
              <div className="dk-report-card">
                <div className="dk-report-card-head">
                  <h2>Linked payment</h2>
                  <span className="dk-badge dk-badge-neutral">
                    {paymentStatusLabel(linkedPaymentIntent.status)}
                  </span>
                </div>
                <dl className="dk-fact-grid" style={{ margin: "0 0 14px 0" }}>
                  <dt>Payment</dt>
                  <dd>
                    <AppLink href={`/payments/${linkedPaymentIntent.id}`} className="dk-ref-code">
                      {formatReferenceId(linkedPaymentIntent.id, "PAY")}
                    </AppLink>
                    <CopyButton text={linkedPaymentIntent.id} label="payment ID" variant="icon" />
                  </dd>
                  <dt>Amount</dt>
                  <dd>
                    <strong>{formatPhp(linkedPaymentIntent.amountCentavos)}</strong>
                  </dd>
                  <dt>Status</dt>
                  <dd>{paymentStatusLabel(linkedPaymentIntent.status)}</dd>
                </dl>
                {availability.reason ? (
                  <p className="dk-muted" style={{ margin: "0 0 14px 0", fontSize: 12 }}>
                    {availability.reason}
                  </p>
                ) : null}
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

            {/* Ledger Policy Card */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Ledger integrity</h2>
              </div>
              <p className="dk-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
                Freezing affected financial activity never rewrites ledger history. Amounts shown are
                booking totals, not raw provider payloads.
              </p>
            </div>

            {/* Case Metadata */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Case metadata</h2>
              </div>
              <dl className="dk-fact-grid" style={{ margin: 0 }}>
                <dt>Dispute ID</dt>
                <dd>
                  <code style={{ fontSize: 11.5, wordBreak: "break-all" }}>{detail.id}</code>
                  <CopyButton text={detail.id} label="dispute ID" variant="icon" />
                </dd>
                <dt>Booking ID</dt>
                <dd>
                  <AppLink href={`/bookings/${detail.bookingId}`} style={{ fontSize: 12 }}>
                    <code style={{ fontSize: 11.5, wordBreak: "break-all" }}>{detail.bookingId}</code>
                  </AppLink>
                  <CopyButton text={detail.bookingId} label="booking ID" variant="icon" />
                </dd>
                <dt>Disputed amount</dt>
                <dd>{formatPhp(detail.amountCentavos)}</dd>
                <dt>Opened at</dt>
                <dd>{formatDateTime(detail.openedAt)}</dd>
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
