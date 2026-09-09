import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import type { AdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { formatReferenceId } from "@/lib/format-id";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { CaseHistoryList } from "@/components/ui/CaseHistoryList";
import { EvidenceList } from "@/components/ui/EvidenceList";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { SupportActionsPanel } from "./SupportActionsPanel";
import { ticketStatusLabel, ticketStatusMeaning, ticketStatusTone } from "../status";

export const metadata: Metadata = { title: "Support ticket" };

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
 * Support ticket detail.
 *
 * Clean, minimal workstation layout for support operators. When unassigned,
 * presents an integrated assignment card explaining data protection rules
 * and the materials held under ticket review.
 */
export default async function SupportTicketDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;

  return (
    <div className="dk-detail">
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Support tickets", href: "/support" },
            { label: "Case review" },
          ]}
        />
        <AppLink href="/support" className="dk-back-btn">
          <ArrowLeftIcon />
          <span>Back to tickets</span>
        </AppLink>
      </nav>
      <Suspense fallback={<DetailRegionSkeleton cards={4} lines={3} />}>
        <SupportTicketRecord id={id} session={session} />
      </Suspense>
    </div>
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

  const isAssigned = detail.assignee !== null;

  return (
    <>
      {/* Header Summary */}
      <header className="dk-report-hero">
        <div className="dk-report-hero-head">
          <div>
            <h1 className="dk-report-hero-title">{detail.subject}</h1>
            <p className="dk-report-hero-meaning">{ticketStatusMeaning(detail.status)}</p>
          </div>
          <div style={{ flexShrink: 0 }}>
            <StatusBadge
              tone={ticketStatusTone(detail.status)}
              label={ticketStatusLabel(detail.status)}
            />
          </div>
        </div>

        {/* Key Metrics */}
        <dl className="dk-report-metrics">
          <Fact label="Ticket reference">
            <span className="dk-ref-code" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
              {formatReferenceId(detail.id, "TCK", detail.updatedAt)}
            </span>
            <CopyButton text={detail.id} label="ticket reference ID" variant="icon" />
          </Fact>
          <Fact label="Requested by">
            <span>{detail.requesterDisplayName}</span>
          </Fact>
          <Fact label="Category">
            <span className="dk-badge dk-badge-neutral">{detail.category}</span>
          </Fact>
          <Fact label="Last updated">
            <time dateTime={detail.updatedAt}>{formatDateTime(detail.updatedAt)}</time>
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
                : "Assigned to Another Support Agent"}
            </h2>
            <p className="dk-report-lock-desc">
              {detail.access.reason === "unassigned"
                ? "To maintain customer confidentiality and audit integrity, detailed case statements, uploaded evidence files, and handling controls are restricted until claimed by a support agent."
                : `This ticket is currently assigned to ${detail.assignee ?? "another support agent"}. Sensitive narrative details and evidence are restricted to the active assignee.`}
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
              <SupportActionsPanel
                ticketId={detail.id}
                status={detail.status}
                assignee={detail.assignee}
                actor={session.email}
              />
            </div>
          </div>

          <div className="dk-report-lock-preview">
            <h3 className="dk-report-lock-preview-title">Protected Information in this Ticket</h3>
            <p className="dk-report-lock-preview-sub">
              {detail.access.reason === "unassigned"
                ? "Assign this ticket to yourself to inspect and action the following materials:"
                : "The following items are restricted to the active ticket assignee:"}
            </p>
            <div className="dk-report-locked-grid">
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Subject Context & Target Resource</span>
                <p>Associated resource context, booking, or user profile details.</p>
              </div>
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Statement & Detailed Narrative</span>
                <p>Customer issue description, troubleshooting steps, and request notes.</p>
              </div>
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Evidence & File Attachments</span>
                <p>Private object storage uploads, diagnostic screenshots, and files.</p>
              </div>
              <div className="dk-report-locked-item">
                <span className="dk-report-locked-item-head">Resolution & State Transitions</span>
                <p>Controls to advance status (pending, resolved, closed) and record actions.</p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="dk-report-grid">
          {/* Main Column */}
          <div className="dk-report-main">
            {/* Subject & Narrative */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Ticket details</h2>
                <span className="dk-badge dk-badge-neutral">{detail.category}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--dk-textSecondary)" }}>
                <strong>Subject reference:</strong> {detail.caseSubject.resourceLabel}
              </p>
              {detail.narrative ? (
                <div className="dk-report-narrative-box">
                  {detail.narrative}
                </div>
              ) : (
                <p className="dk-muted" style={{ marginTop: 12 }}>
                  No additional written narrative was provided with this ticket.
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
                Attachment names and notes only. Raw storage files require an authorized signed URL.
              </p>
              <EvidenceList items={detail.evidence} />
            </div>

            {/* History */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Case history</h2>
                <span className="dk-badge dk-badge-neutral">
                  {detail.history.length} {detail.history.length === 1 ? "event" : "events"}
                </span>
              </div>
              <CaseHistoryList events={detail.history} statusLabel={ticketStatusLabel} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="dk-report-sidebar">
            {/* Actions Panel */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Ticket actions</h2>
                <StatusBadge
                  tone={ticketStatusTone(detail.status)}
                  label={ticketStatusLabel(detail.status)}
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
              <SupportActionsPanel
                ticketId={detail.id}
                status={detail.status}
                assignee={detail.assignee}
                actor={session.email}
              />
            </div>

            {/* Case Metadata */}
            <div className="dk-report-card">
              <div className="dk-report-card-head">
                <h2>Case metadata</h2>
              </div>
              <dl className="dk-fact-grid" style={{ margin: 0 }}>
                <dt>Ticket ID</dt>
                <dd>
                  <code style={{ fontSize: 11.5, wordBreak: "break-all" }}>{detail.id}</code>
                  <CopyButton text={detail.id} label="ticket ID" variant="icon" />
                </dd>
                <dt>Category</dt>
                <dd>{detail.category}</dd>
                <dt>Requester</dt>
                <dd>{detail.requesterDisplayName}</dd>
                <dt>Last updated</dt>
                <dd>{formatDateTime(detail.updatedAt)}</dd>
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
