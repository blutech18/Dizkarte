import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { UserRowActions } from "../UserRowActions";

export const metadata: Metadata = { title: "User" };

function accountTone(status: string): BadgeTone {
  switch (status) {
    case "active":
      return "success";
    case "suspended":
      return "warning";
    case "banned":
      return "error";
    default:
      return "neutral";
  }
}

function verificationTone(status: string | null): BadgeTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "error";
    case "SUBMITTED":
    case "IN_REVIEW":
    case "RESUBMISSION_REQUIRED":
      return "warning";
    default:
      return "neutral";
  }
}

export default async function UserDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;
  const repository = getAdminRepository();
  const user = await repository.getUser(id);
  if (!user) notFound();

  const activeCapabilities = user.capabilities.filter((grant) => grant.revokedAt === null);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Users", href: "/users" },
          { label: user.displayName },
        ]}
      />
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">{user.displayName}</h1>
          <p className="dk-page-subtitle">
            Joined {new Date(user.createdAt).toLocaleDateString("en-PH")} · Language{" "}
            {user.language}
            {user.cityCode ? ` · City ${user.cityCode}` : ""}
          </p>
        </div>
        <StatusBadge tone={accountTone(user.accountStatus)} label={user.accountStatus} />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Account</h2>
        <p className="dk-muted">
          Email addresses live in Supabase Auth and are not readable by the console, so they are not
          shown here.
        </p>
        <dl>
          <dt>Identity verification</dt>
          <dd>
            <StatusBadge
              tone={verificationTone(user.verificationStatus)}
              label={user.verificationStatus ?? "No case"}
            />
          </dd>
          <dt>Tasker application</dt>
          <dd>{user.taskerApplicationStatus ?? "None"}</dd>
          <dt>Active capabilities</dt>
          <dd>
            {activeCapabilities.length === 0
              ? "None"
              : activeCapabilities.map((grant) => grant.capability).join(", ")}
          </dd>
        </dl>
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Marketplace activity</h2>
        <dl>
          <dt>Tasks posted</dt>
          <dd>{user.taskCount}</dd>
          <dt>Bookings as Client</dt>
          <dd>{user.bookingCountAsClient}</dd>
          <dt>Bookings as Tasker</dt>
          <dd>{user.bookingCountAsTasker}</dd>
        </dl>
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Capability history</h2>
        {user.capabilities.length === 0 ? (
          <p className="dk-muted">No capability grants recorded.</p>
        ) : (
          <ul>
            {user.capabilities.map((grant) => (
              <li key={`${grant.capability}-${grant.grantedAt}`}>
                <strong>{grant.capability}</strong>{" "}
                <span className="dk-muted">
                  granted {new Date(grant.grantedAt).toLocaleString("en-PH")}
                  {grant.revokedAt
                    ? ` · revoked ${new Date(grant.revokedAt).toLocaleString("en-PH")}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Moderation history</h2>
        {user.moderationHistory.length === 0 ? (
          <p className="dk-muted">No moderation action has been taken on this account.</p>
        ) : (
          <ul>
            {user.moderationHistory.map((entry) => (
              <li key={entry.id} style={{ marginBottom: 8 }}>
                <strong>{entry.action}</strong>{" "}
                <span className="dk-muted">
                  by {entry.actor}
                  {entry.capability ? ` (${entry.capability})` : ""} ·{" "}
                  {new Date(entry.at).toLocaleString("en-PH")}
                </span>
                <div>{entry.reason}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Account actions</h2>
        <p className="dk-muted">
          Suspending or banning an account withdraws every capability-gated surface immediately,
          without discarding the capability grants, so reinstatement is lossless. Each action
          requires a reason and is audited.
        </p>
        <UserRowActions userId={user.id} status={user.accountStatus} />
      </div>
    </>
  );
}
