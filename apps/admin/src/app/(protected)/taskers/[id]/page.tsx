import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime, formatElapsed } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  isAwaitingAdminDecision,
  taskerApplicationStatusLabel,
  taskerApplicationStatusMeaning,
  taskerApplicationStatusTone,
  taskerDecisionsFor,
} from "../status";
import { TaskerDecisionPanel } from "./TaskerDecisionPanel";

export const metadata: Metadata = { title: "Tasker application" };

function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Verbatim applicant text, quoted so it is never read as console copy. */
function Statement({ label, value }: { readonly label: string; readonly value: string }) {
  const provided = value.trim().length > 0;
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>
        {provided ? (
          <blockquote className="dk-quote">{value}</blockquote>
        ) : (
          <span className="dk-muted">Not provided</span>
        )}
      </dd>
    </div>
  );
}

function ChipList({
  label,
  values,
  emptyText,
}: {
  readonly label: string;
  readonly values: ReadonlyArray<string>;
  readonly emptyText: string;
}) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>
        {values.length === 0 ? (
          <span className="dk-muted">{emptyText}</span>
        ) : (
          <ul className="dk-chip-list">
            {values.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

/**
 * Tasker application review.
 *
 * Almost everything on this page is one record, so the shell that can be shown
 * without waiting is deliberately small: the breadcrumb trail and the way back
 * to the queue. Those are exactly what an operator needs if the record is slow —
 * proof they are on the right page, and an escape hatch — so they are returned
 * immediately and the record streams in behind its own boundary.
 *
 * The final breadcrumb is a static label rather than the applicant's name: the
 * name is already the page's `h1`, so repeating it bought nothing and would have
 * held the whole trail back until the query returned.
 */
export default async function TaskerApplicationDetailPage({
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
          { label: "Tasker applications", href: "/taskers" },
          { label: "Application review" },
        ]}
      />

      <Suspense fallback={<DetailRegionSkeleton cards={5} lines={3} />}>
        <TaskerApplicationRecord applicationId={id} />
      </Suspense>

      <p>
        <AppLink href="/taskers">Back to applications</AppLink>
      </p>
    </div>
  );
}

async function TaskerApplicationRecord({ applicationId }: { readonly applicationId: string }) {
  const repository = getAdminRepository();
  const detail = await repository.getTaskerApplication(applicationId);
  if (!detail) notFound();

  const decisions = taskerDecisionsFor(detail.status);
  const waiting = isAwaitingAdminDecision(detail.status);

  /*
    Completeness is context for a human reviewer, not a score. Each item states
    what is present rather than passing judgement, so an incomplete application
    is never mistaken for a rejected one.
  */
  const completeness: ReadonlyArray<{ label: string; provided: boolean; detail: string }> = [
    {
      label: "Bio",
      provided: detail.bio.trim().length > 0,
      detail: detail.bio.trim().length > 0 ? "Statement provided" : "No statement provided",
    },
    {
      label: "Experience",
      provided: detail.experience.trim().length > 0,
      detail:
        detail.experience.trim().length > 0 ? "Experience provided" : "No experience provided",
    },
    {
      label: "Specialties",
      provided: detail.specialties.length > 0,
      detail: `${detail.specialties.length} listed`,
    },
    {
      label: "Service areas",
      provided: detail.serviceAreas.length > 0,
      detail: `${detail.serviceAreas.length} listed`,
    },
    {
      label: "Portfolio",
      provided: detail.portfolioCount > 0,
      detail: `${detail.portfolioCount} item${detail.portfolioCount === 1 ? "" : "s"} attached`,
    },
  ];

  return (
    <>
      {/* The status is stated once, with the sentence that says who acts next. */}
      <header className="dk-detail-header">
        <div className="dk-detail-header-main">
          <h1>{detail.userDisplayName}</h1>
          <StatusBadge
            tone={taskerApplicationStatusTone(detail.status)}
            label={taskerApplicationStatusLabel(detail.status)}
          />
        </div>
        <p className="dk-detail-header-meaning">{taskerApplicationStatusMeaning(detail.status)}</p>
        <dl className="dk-detail-header-meta">
          <Fact label="Submitted">
            <time dateTime={detail.submittedAt}>{formatDateTime(detail.submittedAt)}</time>
          </Fact>
          {waiting ? <Fact label="Waiting">{formatElapsed(detail.submittedAt)}</Fact> : null}
          <Fact label="Application reference">
            <code>{detail.id}</code>
          </Fact>
        </dl>
      </header>

      <section className="dk-card" aria-labelledby="statement-heading">
        <h2 id="statement-heading">About the applicant</h2>
        <dl className="dk-fact-grid">
          <Statement label="Bio" value={detail.bio} />
          <Statement label="Experience" value={detail.experience} />
        </dl>
      </section>

      <section className="dk-card" aria-labelledby="services-heading">
        <h2 id="services-heading">Services and coverage</h2>
        <dl className="dk-fact-grid">
          <ChipList
            label="Specialties"
            values={detail.specialties}
            emptyText="No specialties listed"
          />
          <ChipList
            label="Service areas"
            values={detail.serviceAreas}
            emptyText="No service areas listed"
          />
          <Fact label="Portfolio evidence">
            {detail.portfolioCount === 0 ? (
              <span className="dk-muted">No items attached</span>
            ) : (
              `${detail.portfolioCount} item${detail.portfolioCount === 1 ? "" : "s"} attached`
            )}
          </Fact>
        </dl>
      </section>

      <section className="dk-card" aria-labelledby="completeness-heading">
        <h2 id="completeness-heading">Application completeness</h2>
        <p className="dk-card-note">Context for your review, not an approval score.</p>
        <dl className="dk-fact-grid">
          {completeness.map((item) => (
            <Fact key={item.label} label={item.label}>
              <StatusBadge
                tone={item.provided ? "success" : "neutral"}
                label={item.provided ? "Provided" : "Missing"}
              />
              <span className="dk-fact-aside">{item.detail}</span>
            </Fact>
          ))}
        </dl>
      </section>

      <section className="dk-card" aria-labelledby="payout-heading">
        <h2 id="payout-heading">Payout method</h2>
        <dl className="dk-fact-grid">
          <Fact label="Provider token">{detail.payoutTokenBoundaryLabel}</Fact>
        </dl>
        <p className="dk-card-note">
          Only the provider token reference is stored. Raw card and wallet credentials are never
          exposed to this console.
        </p>
      </section>

      <section className="dk-card" aria-labelledby="decision-heading">
        <h2 id="decision-heading">
          {decisions.length === 0 ? "Review complete" : "Make a decision"}
        </h2>
        {decisions.length === 0 ? (
          <p className="dk-muted">There is no decision available for this application.</p>
        ) : (
          <>
            <p className="dk-card-note">
              A written reason is required and recorded against your Admin account.
            </p>
            <TaskerDecisionPanel applicationId={detail.id} currentStatus={detail.status} />
          </>
        )}
      </section>
    </>
  );
}
