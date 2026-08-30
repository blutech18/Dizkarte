import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UserRowActions } from "../UserRowActions";
import { userStatusLabel, userStatusMeaning, userStatusTone } from "../status";
import { verificationStatusLabel, verificationStatusTone } from "../../verification/status";
import { taskerApplicationStatusLabel, taskerApplicationStatusTone } from "../../taskers/status";

export const metadata: Metadata = { title: "User" };

/** Label/value pair. The value sits under the label at full width, never indented. */
function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * User account detail.
 *
 * Almost everything on this page is one record, so the shell that can be shown
 * without waiting is deliberately small: the breadcrumb trail. That is exactly
 * what an operator needs if the record is slow — proof they are on the right
 * page — so it is returned immediately and the record streams in behind its own
 * boundary. Awaiting the record here would hold the trail back too.
 *
 * The final breadcrumb is a static label rather than the person's name: the name
 * is already the page's `h1`, so repeating it bought nothing and would have held
 * the whole trail back until the query returned.
 */
export default async function UserDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { id } = await params;

  return (
    <div className="dk-detail">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Users", href: "/users" },
          { label: "Account" },
        ]}
      />

      <Suspense fallback={<DetailRegionSkeleton cards={5} lines={3} />}>
        <UserRecord userId={id} />
      </Suspense>
    </div>
  );
}

async function UserRecord({ userId }: { readonly userId: string }) {
  const repository = getAdminRepository();
  const user = await repository.getUser(userId);
  if (!user) notFound();

  const activeCapabilities = user.capabilities.filter((grant) => grant.revokedAt === null);
  const revokedCount = user.capabilities.length - activeCapabilities.length;

  return (
    <>
      {/*
        The account status is stated once, here, with the sentence that says what
        it actually blocks. Repeating it in a summary card below made two places
        that could disagree after a moderation action.
      */}
      <header className="dk-detail-header">
        <div className="dk-detail-header-main">
          <h1>{user.displayName}</h1>
          <StatusBadge
            tone={userStatusTone(user.accountStatus)}
            label={userStatusLabel(user.accountStatus)}
          />
        </div>
        <p className="dk-detail-header-meaning">{userStatusMeaning(user.accountStatus)}</p>
        <dl className="dk-detail-header-meta">
          <Fact label="Joined">
            <time dateTime={user.createdAt}>{formatDateTime(user.createdAt)}</time>
          </Fact>
          <Fact label="Language">{user.language}</Fact>
          <Fact label="City code">{user.cityCode ?? "Not set"}</Fact>
        </dl>
      </header>

      <section className="dk-card" aria-labelledby="standing-heading">
        <h2 id="standing-heading">Standing</h2>
        <dl className="dk-fact-grid">
          <Fact label="Identity verification">
            {user.verificationStatus ? (
              <StatusBadge
                tone={verificationStatusTone(user.verificationStatus)}
                label={verificationStatusLabel(user.verificationStatus)}
              />
            ) : (
              <span className="dk-muted">No case submitted</span>
            )}
          </Fact>
          <Fact label="Tasker application">
            {user.taskerApplicationStatus ? (
              <StatusBadge
                tone={taskerApplicationStatusTone(user.taskerApplicationStatus)}
                label={taskerApplicationStatusLabel(user.taskerApplicationStatus)}
              />
            ) : (
              <span className="dk-muted">Never applied</span>
            )}
          </Fact>
          <Fact label="Active capabilities">
            {activeCapabilities.length === 0 ? (
              <span className="dk-muted">None granted</span>
            ) : (
              activeCapabilities.map((grant) => grant.capability).join(", ")
            )}
          </Fact>
        </dl>
        <p className="dk-card-note">
          Email addresses live in Supabase Auth and are not readable by the console.
        </p>
      </section>

      <section className="dk-card" aria-labelledby="activity-heading">
        <h2 id="activity-heading">Marketplace activity</h2>
        <dl className="dk-fact-grid dk-fact-grid-numeric">
          <Fact label="Tasks posted">{user.taskCount}</Fact>
          <Fact label="Bookings as Client">{user.bookingCountAsClient}</Fact>
          <Fact label="Bookings as Tasker">{user.bookingCountAsTasker}</Fact>
        </dl>
      </section>

      <section className="dk-card" aria-labelledby="capabilities-heading">
        <h2 id="capabilities-heading">Capability history</h2>
        {user.capabilities.length === 0 ? (
          <p className="dk-muted">No capability grant recorded.</p>
        ) : (
          <>
            <p className="dk-card-note">
              {activeCapabilities.length} active, {revokedCount} revoked.
            </p>
            <ul className="dk-history">
              {user.capabilities.map((grant) => (
                <li key={`${grant.capability}-${grant.grantedAt}`}>
                  <div className="dk-history-head">
                    <strong>{grant.capability}</strong>
                    <StatusBadge
                      tone={grant.revokedAt ? "neutral" : "success"}
                      label={grant.revokedAt ? "Revoked" : "Active"}
                    />
                  </div>
                  <p className="dk-history-meta">
                    Granted{" "}
                    <time dateTime={grant.grantedAt}>{formatDateTime(grant.grantedAt)}</time>
                    {grant.revokedAt ? (
                      <>
                        {" · revoked "}
                        <time dateTime={grant.revokedAt}>{formatDateTime(grant.revokedAt)}</time>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="dk-card" aria-labelledby="moderation-heading">
        <h2 id="moderation-heading">Moderation history</h2>
        {user.moderationHistory.length === 0 ? (
          <p className="dk-muted">No moderation action has been taken on this account.</p>
        ) : (
          <ul className="dk-history">
            {user.moderationHistory.map((entry) => (
              <li key={entry.id}>
                <div className="dk-history-head">
                  <strong>{entry.action}</strong>
                  <time className="dk-history-time" dateTime={entry.at}>
                    {formatDateTime(entry.at)}
                  </time>
                </div>
                <p className="dk-history-meta">
                  {entry.actor}
                  {entry.capability ? ` · ${entry.capability}` : ""}
                </p>
                {/* Verbatim Admin-entered reason, quoted so it is never read as console copy. */}
                <blockquote className="dk-quote">{entry.reason}</blockquote>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dk-card" aria-labelledby="actions-heading">
        <h2 id="actions-heading">Account actions</h2>
        <p className="dk-card-note">
          Every action requires a reason and is audited. Capability grants are kept, so
          reinstatement is lossless.
        </p>
        <UserRowActions userId={user.id} status={user.accountStatus} />
      </section>
    </>
  );
}
