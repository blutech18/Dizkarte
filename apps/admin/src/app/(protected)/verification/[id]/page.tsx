import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { verificationStatusLabel, verificationStatusTone } from "../status";
import { VerificationDecisionPanel } from "./VerificationDecisionPanel";

export const metadata: Metadata = { title: "Verification case" };

export default async function VerificationDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;
  const repository = getAdminRepository();
  const detail = await repository.getVerificationCase(id);

  if (!detail) {
    notFound();
  }

  const isFinal = detail.status === "APPROVED" || detail.status === "REJECTED";

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Identity verification", href: "/verification" },
          { label: detail.userDisplayName },
        ]}
      />
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">{detail.userDisplayName}</h1>
          <p className="dk-page-subtitle">
            Case {detail.id} · Submitted {new Date(detail.submittedAt).toLocaleString("en-PH")}
          </p>
        </div>
        <StatusBadge
          tone={verificationStatusTone(detail.status)}
          label={verificationStatusLabel(detail.status)}
        />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Submitted documents</h2>
        <p className="dk-muted">
          Manual review only — no automated KYC decisioning is performed. Each document is served
          through a short-lived, authorized signed URL; the values below are development
          placeholders, not real files.
        </p>
        <ul>
          {detail.documents.map((doc) => (
            <li key={doc.kind}>
              <code>{doc.kind}</code> — <span className="dk-muted">{doc.signedUrlPreview}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Status history</h2>
        <table className="dk-table">
          <caption className="dk-visually-hidden">Status history</caption>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col">Actor</th>
              <th scope="col">Reason</th>
              <th scope="col">At</th>
            </tr>
          </thead>
          <tbody>
            {detail.history.map((event, index) => (
              <tr key={index}>
                <td>{event.fromStatus}</td>
                <td>{event.toStatus}</td>
                <td>{event.actor}</td>
                <td>{event.reason ?? "—"}</td>
                <td>{new Date(event.at).toLocaleString("en-PH")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Decision</h2>
        {isFinal ? (
          <p className="dk-muted">
            This case already has a final decision and cannot be changed here.
          </p>
        ) : (
          <VerificationDecisionPanel caseId={detail.id} />
        )}
      </div>
    </>
  );
}
