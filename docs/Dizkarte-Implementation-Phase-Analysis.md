# Dizkarte Implementation Phase Analysis

**Document type:** Engineering execution plan and phase analysis  
**Version:** 1.0  
**Prepared:** 20 July 2026, 21:02 PHT  
**Contract execution window:** 20 July–21 September 2026  
**Delivery model:** Production-oriented MVP, modular monolith, vertical-slice delivery

## 1. Purpose and authority

This analysis defines how I would professionally build Dizkarte from scratch within the timeline stated in:

1. `DIZKARTE_SOFTWARE_DEVELOPMENT_AGREEMENT-Contract.txt`
2. `Dizkarte-Proposed-System.md`

Execution status must be confirmed against the parties’ fully signed copy; the supplied text alone does not establish that both parties signed it. The Agreement and attached Scope of Work/Product Specification remain authoritative as confirmed by the parties. Dizkarte-Proposed-System.md is an implementation proposal, not the attached Scope of Work; items it identifies as **Proposed** or **Decision required** become binding only through written approval. This document sequences the work, exposes dependencies, and defines engineering gates; it does not amend the contract, reduce scope, or constitute legal advice. Any changed date, feature, acceptance condition, or cost requires the written process defined by the Agreement.

## 2. Executive engineering assessment

The contract provides **64 calendar days** across five phases and four PHP 20,000 acceptance milestones. The required product is not a simple mobile application: it combines identity verification, a two-sided marketplace, geospatial discovery, media, realtime messaging, notifications, protected payment handling, a financial ledger, payouts, disputes, reviews, administration, two mobile-store releases, documentation, and turnover.

The schedule is therefore **compressed and high risk**, particularly if one developer starts from an empty repository. It is credible only if all of the following remain true:

- The sourced MVP is frozen and additions use written change control.
- The Client provides decisions, assets, accounts, policies, and approvals within agreed response times.
- Payment-provider and app-store onboarding starts immediately rather than waiting for the coding phase in which it is used.
- Subject to Phase 1 approval—or a written-approved equivalent architecture—React Native/Expo, Next.js, Supabase/PostgreSQL/PostGIS, and Firebase are used as the managed baseline.
- Work is delivered as complete vertical slices, with testing and documentation performed continuously.
- Payment, verification, and administrative actions remain server-authoritative.
- Store/provider approval time is tracked as an external dependency and not represented as developer-controlled.

At the preparation time of this analysis, Phase 1 is late in its first calendar day and enters its final calendar day on 21 July in Philippine time. If no setup work has yet been completed, Milestone 1 is immediately at risk. The professional response is to issue a written risk notice, complete the work properly, and obtain actual written acceptance—not to declare an incomplete milestone finished.

## 3. Non-negotiable system invariants

These rules shape every phase and must be encoded in database constraints, RLS policies, server functions, tests, and admin permissions:

1. A user cannot post a task before approved identity verification.
2. A tasker cannot submit/accept paid work before tasker approval.
3. Exact address, contact details, and full private messaging stay unavailable before verified payment confirmation.
4. Booking confirmation comes from a verified provider event, never only from a mobile success screen.
5. Payment, webhook, refund, release, adjustment, and withdrawal operations are idempotent.
6. Financial values use integer centavos; balances derive from append-only ledger entries.
7. A withdrawal cannot exceed cleared balance or spend the same balance twice.
8. IDs, selfies, payout data, exact locations, chat/media, and dispute evidence are private by default.
9. Reviews remain hidden until both participants submit or the approved review period expires.
10. Mobile clients cannot directly change balances, verification decisions, payout state, roles, audit records, or review publication state.
11. Every material admin/finance action is authorised server-side, reasoned, timestamped, and audited.
12. A task can have no more than one active confirmed booking.

## 4. Delivery strategy

### 4.1 Build vertical slices, not isolated layers

Each slice must include the mobile/admin UI, schema migration, RLS/storage policy, server logic, error states, tests, telemetry, and documentation needed to demonstrate real behaviour. For example, “task posting” is not complete when a form exists; it is complete when a verified owner can create a valid task, upload permitted media, preserve private location data, retrieve it through authorised queries, and receive safe failure responses.

### 4.2 Recommended technical baseline

- **Mobile:** React Native + Expo Development Builds + strict TypeScript
- **Admin:** Next.js + TypeScript
- **Backend/system of record:** Supabase Auth, PostgreSQL, PostGIS, RLS, Storage, Realtime
- **Privileged operations:** Supabase server functions/database procedures; one small Node service only where a provider SDK or long-running reconciliation process requires it
- **Push:** Firebase Cloud Messaging, with iOS delivery through APNs
- **Maps:** Client-approved provider plus canonical PSGC-derived city/barangay records
- **Payments:** Client-approved Philippine-capable marketplace/protected-funds provider
- **Monitoring:** Sentry plus provider/Supabase operational logs
- **Automation:** GitHub Actions and EAS build profiles
- **Architecture:** modular monolith; no microservices or Kubernetes for the MVP

A practical repository layout is:

```text
apps/
  mobile/
  admin/
packages/
  domain/       # shared types, state rules, validation contracts
  config/       # safe shared configuration
supabase/
  migrations/
  functions/
docs/
  architecture/
  operations/
  acceptance/
```

The repository, Supabase/Firebase projects, store records, domains, and production integration accounts should be Client-controlled from the beginning, with least-privilege developer access.

### 4.3 Environments and release flow

- **Development:** synthetic data and sandbox integrations
- **Staging/UAT:** production-like schema, sandbox money, Client acceptance builds
- **Production:** Client-owned credentials, approved legal copy, monitoring, backups, and controlled migrations

Expected flow: feature branch or small reviewed change → static checks/tests → development smoke test → staging migration/build → acceptance demonstration → production release in the appropriate phase. Secrets never enter source control; `.env.example` documents names and purpose only.

### 4.4 Dynamic planning model

Use one prioritised backlog linked to requirement IDs and milestone acceptance criteria. Items move through:

```text
Not Ready -> Ready -> In Development -> Review/Test -> Staging -> Accepted
                                      \-> Blocked
```

Operating rules:

- Maintain at most two active engineering items to limit unfinished work.
- Re-plan the next 72 hours daily using dependency and risk status.
- Demonstrate working software at least weekly and at every milestone.
- Record decisions, assumptions, blockers, defects, and change requests separately.
- Move to independent work when blocked, but never silently replace a contracted deliverable.
- Treat security, database, payment, and release defects before cosmetic refinement.
- Freeze new feature work at the end of Phase 3; Phase 4–5 changes are release blockers, defects, or approved change requests.

## 5. Critical dependency schedule

These are engineering target dates, not new contractual dates. The dependency owners below are operational proposals to be confirmed in writing; they do not add or reallocate contractual duties. Missing a target should trigger immediate impact analysis and written notice.

| Dependency/decision                                                                                  | Proposed dependency owner — to be confirmed |    Target | Consequence if missed                                |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------: | ---------------------------------------------------- |
| Client approver, approval channel, scope baseline, branding direction                                | Client                                      |    21 Jul | Phase 1 cannot close cleanly                         |
| Client-owned Git, Supabase, Firebase, Apple, Google, maps, hosting/domain accounts initiated         | Client with Developer support               | 21–23 Jul | Build, signing, push, or turnover is blocked         |
| Accepted IDs, eligibility, verification/rejection/retention policy                                   | Client/legal                                |    23 Jul | Identity flow cannot be finalised                    |
| Launch geography and canonical city/barangay dataset                                                 | Client                                      |    23 Jul | Posting, filters, and map behaviour remain unstable  |
| Payment-provider candidate and account application                                                   | Client/provider with Developer support      |    21 Jul | Entire protected-payment critical path is threatened |
| Provider sandbox credentials and capability proof for cards, GCash, Maya, hold/release/refund/payout | Provider/Client                             |    28 Jul | Phase 3 mocks cannot be validated against reality    |
| Approved funds flow, terminology, fees, cancellation/refund/dispute/release/payout rules             | Client/legal/finance/provider               |     9 Aug | Ledger and booking state machine cannot be frozen    |
| Production payment onboarding substantially complete                                                 | Provider/Client                             |    23 Aug | Phase 4 and launch are blocked                       |
| Apple/Google app records, identifiers, agreements, test tracks, signing access                       | Client with Developer support               |    31 Jul | Device testing/submission is delayed                 |
| Terms, privacy, safety, prohibited-task, moderation, insurance, support copy                         | Client/legal                                |    23 Aug | Store submission and launch are blocked              |
| UAT users, devices, scenarios, availability, and acceptance channel                                  | Client                                      |    23 Aug | Phase 5 cannot run predictably                       |
| Store metadata, screenshots, support/privacy URLs                                                    | Both parties                                |    30 Aug | Submission package is incomplete                     |

Payment/provider feasibility must be proven early. Supabase statuses cannot legally create “escrow”; the provider and approved legal/compliance model control collection, restriction/holding, release, refund, and payout.

## 6. Contract phase implementation plan

### Phase 1 — Planning and project setup

**Contract dates:** 20–21 July 2026  
**Acceptance:** Milestone 1, PHP 20,000, only after demonstration and written approval

#### Objective

Remove avoidable ambiguity and establish a buildable, secure foundation. Phase 1 is complete only when project skeletons and authentication are demonstrable—not merely discussed.

#### Execution sequence

1. **Governance and traceability**
   - Confirm authoritative source versions and identify the Client approver.
   - Create requirement traceability, decision, assumption, risk, blocker, and change-request registers.
   - Agree demonstration/approval format, defect severity, Definition of Done, and communication cadence.
2. **Product and UX baseline**
   - Confirm client/tasker/admin journeys and original Dizkarte visual direction.
   - Produce low-fidelity flows for registration, verification, task posting, discovery, offers, booking/payment, chat, completion, review, support, tasker dashboard, and admin.
   - Identify loading, empty, offline, denied, failed, retry, and success states.
3. **Architecture and data**
   - Approve the modular monolith and environment strategy.
   - Define the initial ERD, task/booking/payment/review state machines, approximate-versus-private location model, ledger model, storage buckets, indexes, and RLS matrix.
   - Record architecture decisions for payments, maps, auth/social login, notifications, media, and administration.
4. **Working setup**
   - Create the Client-controlled repository, mobile/admin applications, Supabase local/project setup, migrations folder, safe environment template, CI checks, and issue tracker.
   - Configure baseline authentication/session handling and prove mobile/admin connectivity without exposing service credentials.
   - Start payment, Apple, Google, Firebase, and maps onboarding.

#### Required evidence and exit gate

- Mobile and admin skeletons build successfully.
- Authentication smoke flow works in development.
- Approved UX flow set, architecture diagram, ERD/schema plan, RLS matrix, integration plan, and decision register exist.
- Repository/account ownership and access are recorded.
- CI performs at least formatting/lint/type checks and secret-safe configuration validation.
- Critical unknowns have an owner and due date.
- Demonstration is completed and Client approval is recorded in writing.

#### Immediate schedule response

Because this analysis is being prepared late on 20 July, any missing Phase 1 input must be marked **amber/red now**. If a real build, schema design, UX baseline, and Client review cannot be completed on 21 July, submit a reasoned schedule adjustment rather than lowering the acceptance standard.

### Phase 2 — Core marketplace development

**Contract dates:** 22 July–9 August 2026  
**Acceptance:** Milestone 2, PHP 20,000, after demonstration and written approval

#### Objective

Deliver the complete pre-payment marketplace path: verified user → approved tasker → published task → discovery → offer → selected offer/payment-pending booking.

#### Proposed delivery waves

##### Wave 2A — Identity and profiles (22–26 Jul)

- Registration, sign-in/out, password reset, session restoration, and account-state handling
- Client profile, mobile number, city/barangay, photo, preferences, and profile completeness
- Private government-ID/selfie upload, verification case/status, rejection reason, and resubmission
- Tasker application, service areas, specialties, biography, experience, portfolio, payout-details placeholder/token boundary
- Admin verification/tasker-review queue with reasoned approve/reject/resubmit actions
- RLS/storage tests proving unrelated users cannot access documents

##### Wave 2B — Tasks and locations (27 Jul–1 Aug)

- Draft/publish/edit/cancel rules according to approved lifecycle
- Manual task title/description, category, budget, schedule, same-day/flexible flags, and media
- PSGC city/barangay selection and separate approximate/public versus exact/private location storage
- Server-side validation, upload limits, ownership checks, PII/content warnings, and audit events
- Client task list/detail/status views and admin task/category management

##### Wave 2C — Discovery and offers (2–5 Aug)

- Paginated open-task feed and details
- Indexed keyword/category/city/barangay/budget/date/status filters and newest/high-budget sorts
- Availability rules excluding private, removed, expired, cancelled, or assigned tasks
- Approved-tasker offer creation/edit/withdraw rules, experience/availability/message/questions
- Client offer comparison with tasker profile, rating placeholders/empty states, and portfolio
- Pre-booking communication restrictions and basic contact/payment-detail abuse handling

##### Wave 2D — Selection, dashboards, and hardening (6–9 Aug)

- Transaction-safe offer selection and one-active-booking rule
- Booking state through `PAYMENT_PENDING`; no client-controlled confirmation
- Client workflow and complete Tasker Dashboard navigation/read models
- Earnings/pending/available/withdrawal panels backed by real domain interfaces and deterministic test ledger data—not static UI placeholders—until provider connection in Phase 4
- Admin user/task/tasker/category/audit foundations
- End-to-end regression, unauthorised-access tests, device smoke tests, demonstration, defect correction, and written acceptance

#### Phase 2 exit gate

- Unverified users cannot post; unapproved taskers cannot offer.
- A verified client can publish a valid task without exposing exact location.
- An approved tasker can discover it through required feed/search/filter paths and submit an offer.
- The client can compare/select an offer and create exactly one payment-pending booking.
- Ownership, RLS, upload, validation, and concurrency tests pass.
- Tasker Dashboard and administrative foundation are usable with clearly identified sandbox financial data.
- All material Milestone 2 defects are resolved and approval is written.

### Phase 3 — Advanced marketplace features

**Contract dates:** 10–23 August 2026  
**Acceptance:** Milestone 3, PHP 20,000, after demonstration and written approval

#### Objective

Complete the interactive marketplace and operational controls around a provider-independent payment state contract.

#### Proposed delivery waves

##### Wave 3A — Geospatial discovery and messaging (10–13 Aug)

- PostGIS distance queries, nearby sorting, approximate map pins, clustering/pagination as required
- Consistency between feed, filters, and map results
- Booking conversation creation, participant-only RLS, text/media messages, timestamps, retry/error states
- Payment gate enforced by server-authoritative `CONFIRMED` status
- Deterministic sandbox event used to test the gate; no production-accessible bypass

##### Wave 3B — Notifications and completion (14–16 Aug)

- In-app notification records and preferences
- FCM/APNs device registration and push delivery for offers, bookings, messages, payment states, review reminders, and approved nearby alerts
- Completion request/confirmation state transitions against the payment abstraction
- Duplicate/reordered event handling and safe notification retries

##### Wave 3C — Reviews and trust/safety (17–19 Aug)

- One review per participant per completed booking
- Hidden-until-both-or-expiry publication rule
- Rating/completion aggregate updates through server logic
- Reports, support tickets, disputes, evidence, status history, moderation and freeze records
- Privacy-safe access to dispute/chat evidence

##### Wave 3D — Complete admin and milestone hardening (20–23 Aug)

- Admin modules for verification, users, taskers, tasks/content/media, reports, disputes, tickets, audit logs, completed work, payment monitoring, refunds, revenue, payouts, categories, and account freezes
- Finance screens connected to the sandbox/payment abstraction and tested ledger read models, then production-connected in Phase 4
- Role separation for support/verification, finance/disputes, and super-admin where approved
- Security tests for ID, location, conversation, review secrecy, admin routes, and evidence access
- Regression, device demonstration, material-defect correction, and written acceptance

#### Phase 3 exit gate

- Approximate map discovery works and never leaks exact coordinates.
- Full chat is impossible before authoritative payment confirmation and available only to participants/admins with purpose-based access afterward.
- Notifications originate from committed server events and respect preference rules.
- Completion and hidden-review state machines pass happy, retry, timeout, and unauthorised cases.
- Admin actions enforce role, reason, and audit requirements.
- Milestone 3 is demonstrated with the provider abstraction clearly identified; written approval is recorded.

### Phase 4 — Payment integration, testing, and optimisation

**Contract dates:** 24 August–6 September 2026  
**Acceptance:** Contributes to Milestone 4; no separate contractual payment is due here

#### Objective

Connect the approved provider to the already-tested booking contract, prove financial correctness, harden the entire system, and produce release candidates.

#### Proposed delivery waves

##### Wave 4A — Collection and webhook authority (24–26 Aug)

- Provider checkout/session creation for approved credit-card, debit-card, GCash, and Maya capabilities
- Server-side amount/booking validation
- Signature verification, raw event inbox/reference, unique provider-event IDs, idempotent processing, and safe acknowledgement
- Booking confirmation only from verified provider state
- Recovery after user abandonment, provider delay, duplicate events, and out-of-order events

##### Wave 4B — Ledger, fees, release, and refunds (27–30 Aug)

- Append-only, transactionally balanced ledger using integer centavos
- Gross collection, platform fee, tasker payable, protected/pending, released, refunded, disputed/frozen, chargeback/adjustment states as approved
- Release follows Client completion confirmation; any admin, dispute, safety, or automatic-release exception requires a separately approved policy and written change control where it alters the agreed flow
- Refund and dispute-freeze controls with immutable audit references
- Reconciliation from provider transaction to booking and ledger entries

##### Wave 4C — Payouts and finance operations (31 Aug–2 Sep)

- Tokenized/approved bank, GCash, and Maya payout methods according to actual provider capability
- Available-balance checks, withdrawal reservation, provider request, success/failure reversal, and retry controls
- Prevention of duplicate/over-balance withdrawal
- Production-connected Tasker Dashboard and admin transaction/refund/revenue/payout reports
- Daily/manual reconciliation workflow and anomaly alerts

##### Wave 4D — Release hardening (3–6 Sep)

- Full end-to-end, regression, database/RLS, security/privacy, provider-sandbox, interrupted-network, concurrency, and recovery tests
- Feed/search/map/chat/media performance checks and query/index review
- Dependency/secret scan, logging review, backup/restore rehearsal, migration rollback plan, incident/payment runbooks
- Android/iOS release candidates, admin staging release, store metadata/assets, privacy forms, support URLs, and release notes

#### Financial go/no-go tests

- Duplicate or reordered webhook cannot duplicate booking confirmation or ledger entries.
- Client callback alone cannot create a paid balance.
- Release/refund/withdrawal executes once under retries and concurrency.
- Available balance reconciles from immutable ledger entries.
- Provider amount/currency/booking identity mismatch is quarantined.
- Failed payout does not permanently consume user balance.
- Every tested provider transaction can be traced through webhook, booking, ledger, admin view, and reconciliation report.

#### Phase 4 exit gate

No known blocker or critical defect remains. Provider sandbox/production-readiness evidence is complete, financial reconciliation is explainable, backup/restore has been rehearsed, and signed release candidates are ready for Client UAT. If provider production approval is missing, launch is red regardless of application-code completion.

### Phase 5 — UAT, deployment, and turnover

**Contract dates:** 7–21 September 2026  
**Acceptance:** Milestone 4, PHP 20,000, only after all final conditions and written approval

#### Objective

Prove the agreed business flows with the Client, correct in-scope defects, deploy safely, transfer all assets, and establish the maintenance start date.

#### Proposed delivery waves

##### Wave 5A — Controlled UAT and early store review (7–10 Sep)

- Submit the Phase 4 release candidates to Apple/Google review through Client-owned accounts at the opening of Phase 5 while UAT runs in parallel

- Deploy tagged UAT builds and frozen acceptance dataset
- Client executes agreed client/tasker/admin scenarios on representative Android/iOS devices
- Record pass/fail evidence, screenshots/log references where confidentiality permits, severity, owner, and expected correction build
- Classify each request as defect, clarification, or change request before work begins

##### Wave 5B — Corrections and final regression (11–14 Sep)

- Correct blocker/critical/major in-scope defects
- Re-run affected unit, integration, E2E, payment, privacy, and device suites
- Final production migration, RLS/storage, secret, backup, monitoring, signing, and rollback review
- Client confirms UAT closure criteria

##### Wave 5C — Production deployment, corrected binaries, and release progression (15–18 Sep)

- Deploy production database/functions/admin with versioned migrations
- Configure production provider webhooks, Firebase/APNs, maps restrictions, domains, monitoring, and alerts
- Release approved Android/iOS builds or submit corrected binaries immediately after UAT/store feedback through Client-owned accounts
- Perform production smoke tests without unnecessary real PII or money
- Address in-scope store rejection findings promptly

Store review duration is external. Internal/test-track builds and app records must be prepared earlier, but the parties should document whether contractual “successful deployment” means approved/live distribution or technically complete submission plus correction of developer-attributable rejection. Without written clarification, the stricter contract wording remains the acceptance risk.

##### Wave 5D — Turnover and acceptance (19–21 Sep)

- Transfer the complete source code and Git repository; Supabase project and complete database; Firebase project; maps, payment, hosting/domain, Apple/Google store, third-party integration, and project-specific account control; and administrator credentials
- Securely transfer the actual environment-variable values, API keys, service credentials, signing certificates, and signing keys outside source control and ordinary documentation, then verify Client access and administrative control
- Deliver Android and iOS builds, all other build files, database migrations and RLS/storage policies, deployment/build instructions, design assets, architecture/ERD, API/function, testing, recovery, security, moderation, payment/reconciliation, and maintenance documentation
- Conduct knowledge transfer and verify the Client can build, deploy, administer, back up, restore, and operate core workflows
- Deliver UAT evidence, release notes, decision/risk/known-issue registers, and turnover checklist
- Record written final acceptance, official production launch date, and 60-day maintenance end date

#### Final acceptance gate

The Agreement requires successful UAT, agreed revisions, Android/iOS deployment, documentation, all source/repository/credential/asset transfers, and completed turnover. Milestone 4 is not complete merely because the code is in a repository.

## 7. Quality, security, and documentation plan

Testing begins in Phase 1 and grows with every slice; Phase 4 is system hardening, not the first testing phase.

| Test/control     | Continuous expectation                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Static quality   | Formatting, lint, strict TypeScript, build, dependency and secret checks                 |
| Unit             | State transitions, validation, fee/ledger calculations, review visibility, permissions   |
| Database         | Migrations, constraints, indexes, RLS, storage policies, concurrency, rollback           |
| Integration      | Auth, storage, PostGIS, FCM/APNs, provider webhooks, reconciliation                      |
| End-to-end       | Complete client, tasker, admin, payment, completion, review, support journeys            |
| Mobile           | Agreed Android/iOS versions, permissions, camera/gallery, push, poor network, resume     |
| Security/privacy | Privilege escalation, ID/address/chat leakage, upload abuse, rate limiting, admin access |
| Operations       | Backups, restore, monitoring, failed jobs/webhooks, incident and reconciliation runbooks |

**Release severity rule:** no known blocker or critical defect may be accepted or released. Major defects affecting required behaviour must be fixed before milestone approval. Minor issues require written acknowledgement and a scheduled disposition.

A feature is done only when code, schema/policy, error states, tests, telemetry, documentation, staging demonstration, and acceptance evidence are complete. A visually finished screen backed by hard-coded data is not done.

## 8. Dynamic risk and replanning controls

### 8.1 Phase health

- **Green:** required inputs are available; critical-path acceptance is on forecast; no unresolved blocker/critical defect.
- **Amber:** dependency or defect may consume up to two days of buffer; owner and dated mitigation exist.
- **Red:** payment/legal/store/account dependency is unavailable, a critical security/financial invariant fails, or forecast exceeds the contractual phase. Issue written impact notice and revised options immediately.

### 8.2 Blocker procedure

Within the same working day:

1. Record the blocker, evidence, owner, first-known time, and affected requirement/milestone.
2. Estimate critical-path and acceptance impact.
3. Move to the highest-value independent ready item.
4. Present mitigation options: resolve input, use an approved temporary abstraction, extend date, or process a written scope change.
5. Do not treat silence as approval and do not hide scope behind a mock in production.

### 8.3 Scope control

- **Defect:** agreed behaviour is missing or incorrect; correct it within the milestone/maintenance obligation.
- **Clarification:** source intent is ambiguous; obtain a written decision and assess impact.
- **Change request:** new/altered capability, policy, channel, provider, or workflow; document cost/date/acceptance impact before implementation.

Security, privacy, ledger correctness, required payment gates, and turnover controls must not be traded away to recover schedule. If time becomes insufficient, the professional options are a written extension or an explicitly approved scope change.

## 9. Responsibility model

This RACI is an operational proposal only and does not add or reallocate contractual obligations absent written agreement.

| Responsibility                                              | Developer                   | Client/product owner       | Client legal/finance/provider                | UAT users       |
| ----------------------------------------------------------- | --------------------------- | -------------------------- | -------------------------------------------- | --------------- |
| Architecture, implementation, tests, CI/CD, docs            | Responsible                 | Informed/approves baseline | Consulted where relevant                     | Informed        |
| Branding, policies, copy, launch geography, business rules  | Consulted                   | Accountable/responsible    | Consulted/approves regulated rules           | Informed        |
| Payment/KYC/store account ownership and commercial approval | Supports integration        | Accountable                | Responsible                                  | Informed        |
| Milestone demonstration package                             | Responsible                 | Reviews                    | Informed                                     | May participate |
| Written milestone acceptance                                | Provides evidence           | Accountable                | Informed                                     | Consulted       |
| UAT execution and business acceptance                       | Supports/fixes              | Accountable                | Consulted                                    | Responsible     |
| Production operation after turnover                         | Supports during maintenance | Accountable                | Responsible for provider/business operations | —               |

The contract names a single Developer, creating concentration risk. Any additional engineer, tester, designer, or reviewer must be authorised by the Client and covered by the Agreement’s confidentiality, access, and intellectual-property requirements before receiving project information.

## 10. Milestone evidence package

Every milestone submission should contain:

1. Build/release identifier and commit hash
2. Demonstration environment and account roles
3. Requirement/acceptance checklist with pass/fail status
4. Automated/manual test summary
5. Security/privacy checks relevant to the phase
6. Open defects by severity and documented non-material limitations
7. Decisions, dependencies, and change requests
8. Turnover/document updates made during the phase
9. Client written approval, rejection, or requested corrections

| Milestone      | Contract scope                                                                               | Engineering evidence focus                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1 — PHP 20,000 | Planning/setup, UX, database, authentication, structure                                      | Working skeletons, architecture/ERD/RLS, flows, CI, account/dependency register                                 |
| 2 — PHP 20,000 | Registration, profiles, tasks, browse/search/filter, offers, Tasker Dashboard, core workflow | Verified client-to-payment-pending vertical slice and access/concurrency tests                                  |
| 3 — PHP 20,000 | Messaging, maps, ratings/reviews, notifications, admin                                       | Provider-independent paid-state contract, privacy gates, complete operational admin against sandbox adapters    |
| 4 — PHP 20,000 | Payment/protected flow, testing, deployment, source/docs, final acceptance                   | Reconciled provider flow, release evidence, successful UAT/deployment, complete turnover and written acceptance |

## 11. Principal delivery risks

| Risk                                                                     | Trigger                                       | Engineering response                                                                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Provider cannot support required Philippine protected-funds/payout model | Capability proof fails or onboarding stalls   | Escalate immediately; obtain approved provider/flow or written schedule/scope change; never simulate custody               |
| App-store approval extends beyond 21 Sep                                 | Account/review/rejection delay                | Create records/test tracks early, submit release-ready builds promptly, document external delay and correction evidence    |
| Client decisions/assets arrive late                                      | Target date passes                            | Issue dependency notice, work on independent slices, revise forecast under Agreement delay provisions                      |
| Broad scope exceeds single-developer throughput                          | Burndown/quality gates trend red              | Freeze scope, automate critical tests, WIP-limit, seek authorised help or written extension/change—not quality removal     |
| Financial race/idempotency defect                                        | Duplicate event/release/withdrawal test fails | Block release; fix transaction/constraint/ledger model and rerun concurrency/reconciliation suite                          |
| Sensitive-data exposure                                                  | RLS/storage/security test fails               | Treat as critical, revoke access if needed, fix before demonstration/release, review adjacent policies                     |
| Phase 2/3 acceptance expects provider-connected finance before Phase 4   | Client rejects sandbox abstraction            | Obtain written acceptance interpretation early or resequence provider integration with documented impact                   |
| Media/video causes storage, upload, or moderation problems               | Device/network tests or projected costs fail  | Enforce approved limits/compression/private access; use specialised video service only through approved change if required |
| UAT becomes feature discovery                                            | Requests exceed sourced behaviour             | Classify defects versus changes immediately; preserve UAT for acceptance of agreed scope                                   |

## 12. Immediate next actions

If development is genuinely starting from scratch now, complete these in order:

1. Send the Client the Phase 1 schedule-risk and dependency notice.
2. Confirm the authoritative scope, Client approver, written-approval channel, and 24-hour decision cadence for the compressed schedule.
3. Create or confirm Client-owned Git, Supabase, Firebase, Apple, Google, maps, payment, hosting/domain, and issue-tracker access.
4. Start payment-provider capability verification and onboarding before writing provider-specific payment code.
5. Freeze core state machines, privacy separation, initial geography, identity policy, and acceptance scenarios.
6. Create the mobile/admin/backend skeletons, environment templates, CI, first migration, RLS matrix, and authentication smoke flow.
7. Review primary UX flows and demonstrate Milestone 1 with evidence.
8. Begin Phase 2 on 22 July unless the parties approve a written schedule adjustment; carry unresolved Phase 1 decisions or acceptance as visible, owned blockers and continue only where doing so does not compromise the baseline.

## 13. Completion and post-launch

The project is complete only when all required functionality passes UAT, production deployment and turnover conditions are met, and the Client accepts Milestone 4 in writing. The 60-calendar-day maintenance period starts on the recorded official production launch date, not automatically on 21 September if launch occurs later.

Maintenance covers in-scope bugs, errors, performance, compatibility, security fixes, deployment support, technical assistance, general maintenance, knowledge transfer, and assistance during project turnover. New capabilities and enhancements remain subject to written change control.
