import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RestrictedCaseNotice } from "@/components/ui/AsyncState";
import { CaseActionsPanel } from "@/components/ui/CaseActionsPanel";
import { PaymentActionsPanel } from "../../payments/PaymentActionsPanel";
import { ConversationPanel } from "../ConversationPanel";
import { disputeStatusLabel, disputeStatusTone, DISPUTE_STATUS_TRANSITIONS } from "../status";
import { assignDisputeAction, transitionDisputeStatusAction } from "../actions";

export const metadata: Metadata = { title: "Dispute" };

export default async function DisputeDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_FINANCE"]);
  const { id } = await params;
  const repository = getAdminRepository();
  const [detail, availability] = await Promise.all([
    repository.getDispute({ disputeId: id, actor: session.email }),
    repository.getFinanceProviderAvailability(),
  ]);

  if (!detail) {
    notFound();
  }

  const linkedPaymentIntent = await repository.getPaymentIntentByBooking(detail.bookingId);
  const isAssignedToMe = detail.assignee === session.email;
  const allowedTransitions = DISPUTE_STATUS_TRANSITIONS[detail.status] ?? [];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Disputes", href: "/disputes" },
          { label: detail.id },
        ]}
      />
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">Dispute {detail.id}</h1>
          <p className="dk-page-subtitle">
            Booking {detail.bookingId} · {formatPhp(detail.amountCentavos)} · Opened{" "}
            {new Date(detail.openedAt).toLocaleString("en-PH")}
          </p>
        </div>
        <StatusBadge
          tone={disputeStatusTone(detail.status)}
          label={disputeStatusLabel(detail.status)}
        />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Assignment</h2>
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
          <h2 style={{ marginTop: 0 }}>Linked payment</h2>
          <p>
            Payment <a href={`/payments/${linkedPaymentIntent.id}`}>{linkedPaymentIntent.id}</a> ·{" "}
            {formatPhp(linkedPaymentIntent.amountCentavos)} · {linkedPaymentIntent.status}
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
          <div className="dk-card">
            <h2 style={{ marginTop: 0 }}>Subject</h2>
            <p>{detail.caseSubject.resourceLabel}</p>
            <h3>Narrative</h3>
            <p>{detail.narrative}</p>
          </div>

          <div className="dk-card">
            <h2 style={{ marginTop: 0 }}>Evidence</h2>
            <p className="dk-muted">
              Development placeholder metadata only — never a raw storage path, exact location, chat
              body, government ID, or provider payload.
            </p>
            {detail.evidence.length === 0 ? (
              <p className="dk-muted">No evidence was attached to this dispute.</p>
            ) : (
              <ul>
                {detail.evidence.map((item) => (
                  <li key={item.fileName}>
                    <code>{item.fileName}</code> — {item.kind}, {item.mimeType}, {item.sizeBytes}{" "}
                    bytes,{" "}
                    <StatusBadge
                      tone={
                        item.reviewState === "flagged"
                          ? "error"
                          : item.reviewState === "reviewed"
                            ? "success"
                            : "warning"
                      }
                      label={item.reviewState}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="dk-card">
            <h2 style={{ marginTop: 0 }}>Booking conversation</h2>
            <ConversationPanel disputeId={detail.id} disabled={!isAssignedToMe} />
          </div>

          <div className="dk-card">
            <h2 style={{ marginTop: 0 }}>History</h2>
            <table className="dk-table">
              <caption className="dk-visually-hidden">Dispute history</caption>
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
