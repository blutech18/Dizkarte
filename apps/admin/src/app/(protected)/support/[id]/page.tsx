import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EvidenceList } from "@/components/ui/EvidenceList";
import { RestrictedCaseNotice } from "@/components/ui/AsyncState";
import { CaseActionsPanel } from "@/components/ui/CaseActionsPanel";
import { ticketStatusLabel, ticketStatusTone, TICKET_STATUS_TRANSITIONS } from "../status";
import { assignTicketAction, transitionTicketStatusAction } from "../actions";

export const metadata: Metadata = { title: "Support ticket" };

export default async function SupportTicketDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;
  const repository = getAdminRepository();
  const detail = await repository.getTicket({ ticketId: id, actor: session.email });

  if (!detail) {
    notFound();
  }

  const isAssignedToMe = detail.assignee === session.email;
  const allowedTransitions = TICKET_STATUS_TRANSITIONS[detail.status] ?? [];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Support tickets", href: "/support" },
          { label: detail.id },
        ]}
      />
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">{detail.subject}</h1>
          <p className="dk-page-subtitle">
            Ticket {detail.id} · {detail.category} · Requested by {detail.requesterDisplayName} ·
            Updated {new Date(detail.updatedAt).toLocaleString("en-PH")}
          </p>
        </div>
        <StatusBadge
          tone={ticketStatusTone(detail.status)}
          label={ticketStatusLabel(detail.status)}
        />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Assignment</h2>
        <p>
          <strong>Assignee:</strong> {detail.assignee ?? "Unassigned"}
        </p>
        <CaseActionsPanel
          isAssignedToMe={isAssignedToMe}
          isUnassigned={detail.assignee === null}
          assignLabel="Assign to me"
          onAssign={() => assignTicketAction({ ticketId: detail.id })}
          allowedTransitions={allowedTransitions}
          transitionLabel={ticketStatusLabel}
          onTransition={(toStatus, reason) =>
            transitionTicketStatusAction({
              ticketId: detail.id,
              toStatus: toStatus as "OPEN" | "PENDING" | "RESOLVED" | "CLOSED",
              reason,
            })
          }
        />
      </div>

      {detail.access.restricted ? (
        <div className="dk-card">
          <RestrictedCaseNotice reason={detail.access.reason} />
        </div>
      ) : (
        <>
          <div className="dk-card">
            <h2 style={{ marginTop: 0 }}>Subject</h2>
            <p>{detail.caseSubject.resourceLabel}</p>
            <h3>Narrative</h3>
            <p>{detail.narrative}</p>
          </div>

          <div className="dk-card">
            <h2 style={{ marginTop: 0 }}>Evidence</h2>
            <p className="dk-muted">
              Attachment names only. The files themselves stay in private storage and require an
              authorized signed URL, so nothing is rendered from a raw storage path here.
            </p>
            <EvidenceList items={detail.evidence} />
          </div>

          <div className="dk-card">
            <h2 style={{ marginTop: 0 }}>History</h2>
            <table className="dk-table">
              <caption className="dk-visually-hidden">Ticket history</caption>
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Capability</th>
                  <th scope="col">Reason</th>
                  <th scope="col">At</th>
                </tr>
              </thead>
              <tbody>
                {detail.history.map((event, index) => (
                  <tr key={index}>
                    <td>{event.type}</td>
                    <td>{event.fromValue ?? "—"}</td>
                    <td>{event.toValue}</td>
                    <td>{event.actor}</td>
                    <td>{event.capability ?? "—"}</td>
                    <td>{event.reason ?? "—"}</td>
                    <td>{new Date(event.at).toLocaleString("en-PH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
