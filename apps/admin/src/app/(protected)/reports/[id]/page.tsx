import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EvidenceList } from "@/components/ui/EvidenceList";
import { RestrictedCaseNotice } from "@/components/ui/AsyncState";
import { CaseActionsPanel } from "@/components/ui/CaseActionsPanel";
import { reportStatusLabel, reportStatusTone, REPORT_STATUS_TRANSITIONS } from "../status";
import { assignReportAction, transitionReportStatusAction } from "../actions";

export const metadata: Metadata = { title: "Report" };

export default async function ReportDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;
  const repository = getAdminRepository();
  const detail = await repository.getReport({ reportId: id, actor: session.email });

  if (!detail) {
    notFound();
  }

  const isAssignedToMe = detail.assignee === session.email;
  const allowedTransitions = REPORT_STATUS_TRANSITIONS[detail.status] ?? [];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Reports", href: "/reports" },
          { label: detail.id },
        ]}
      />
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">Report {detail.id}</h1>
          <p className="dk-page-subtitle">
            {detail.resourceType} · {detail.category} · Reported by {detail.reporterDisplayName} on{" "}
            {new Date(detail.createdAt).toLocaleString("en-PH")}
          </p>
        </div>
        <StatusBadge
          tone={reportStatusTone(detail.status)}
          label={reportStatusLabel(detail.status)}
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
          onAssign={() => assignReportAction({ reportId: detail.id })}
          allowedTransitions={allowedTransitions}
          transitionLabel={reportStatusLabel}
          onTransition={(toStatus, reason) =>
            transitionReportStatusAction({
              reportId: detail.id,
              toStatus: toStatus as "TRIAGED" | "ACTIONED" | "DISMISSED",
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
              <caption className="dk-visually-hidden">Report history</caption>
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
