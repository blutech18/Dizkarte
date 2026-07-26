import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TaskerDecisionPanel } from "./TaskerDecisionPanel";

export const metadata: Metadata = { title: "Tasker application" };

export default async function TaskerApplicationDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;
  const repository = getAdminRepository();
  const detail = await repository.getTaskerApplication(id);
  if (!detail) notFound();

  const isFinal = detail.status === "REJECTED";

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Tasker applications", href: "/taskers" },
          { label: detail.userDisplayName },
        ]}
      />
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">{detail.userDisplayName}</h1>
          <p className="dk-page-subtitle">Application {detail.id}</p>
        </div>
        <StatusBadge tone="brand" label={detail.status.replace(/_/g, " ")} />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Application details</h2>
        <dl className="dk-stack" style={{ margin: 0 }}>
          <div>
            <dt className="dk-muted">Bio</dt>
            <dd style={{ margin: 0 }}>{detail.bio}</dd>
          </div>
          <div>
            <dt className="dk-muted">Experience</dt>
            <dd style={{ margin: 0 }}>{detail.experience}</dd>
          </div>
          <div>
            <dt className="dk-muted">Specialties</dt>
            <dd style={{ margin: 0 }}>{detail.specialties.join(", ")}</dd>
          </div>
          <div>
            <dt className="dk-muted">Service areas</dt>
            <dd style={{ margin: 0 }}>{detail.serviceAreas.join(", ")}</dd>
          </div>
          <div>
            <dt className="dk-muted">Portfolio items</dt>
            <dd style={{ margin: 0 }}>{detail.portfolioCount}</dd>
          </div>
          <div>
            <dt className="dk-muted">Payout method</dt>
            <dd style={{ margin: 0 }}>
              {detail.payoutTokenBoundaryLabel} — only a provider token reference is stored, never
              raw card/wallet credentials.
            </dd>
          </div>
        </dl>
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Decision</h2>
        {isFinal ? (
          <p className="dk-muted">This application was rejected.</p>
        ) : (
          <TaskerDecisionPanel applicationId={detail.id} currentStatus={detail.status} />
        )}
      </div>
    </>
  );
}
