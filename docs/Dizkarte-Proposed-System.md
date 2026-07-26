# Dizkarte Proposed System

**Document type:** Implementation analysis and delivery proposal  
**Version:** 1.0  
**Prepared:** 19 July 2026  
**Contract schedule:** 20 July–21 September 2026  
**Target market:** Philippines  
**Project type:** Production-ready task marketplace MVP for Android and iOS

## 1. Purpose and authority

This document translates the following source documents into an implementation plan:

1. `Dizkarte-Platform_Scope_of_Work&Product_Specification.txt`
2. `DIZKARTE_SOFTWARE_DEVELOPMENT_AGREEMENT-Contract.txt`, effective 17 July 2026

The Agreement dated 17 July 2026 and the attached Scope of Work/Product Specification remain authoritative. Execution status must be confirmed against the parties’ executed copy; the supplied text alone does not establish that both parties signed it. This proposal clarifies delivery structure; it does not replace or expand either source. If this proposal conflicts with an authoritative source, that source controls unless both parties approve a written change request.

The fixed project fee is **PHP 80,000**, payable in four milestones of **PHP 20,000 (25%)** each. No milestone payment is due until its complete scope has been demonstrated and approved by the Client in writing. The contractual phases run from 20 July through 21 September 2026, subject to the Agreement’s delay and change provisions.

For avoidance of doubt, the Agreement’s confidentiality obligations (including survival after termination), unauthorised-use remedies (including refund, compensation, and injunctive/equitable relief), governing law of the Republic of the Philippines, and exclusive jurisdiction of its competent courts remain unchanged and are not limited by this implementation proposal.

### 1.1 Interpretation labels

- **Required** — expressly stated in the source documents.
- **Proposed** — an implementation choice recommended to satisfy the required scope; subject to Client approval.
- **Decision required** — a business, legal, operational, or provider detail that the sources do not settle.
- **Future scope** — specifically contemplated after the MVP or otherwise not included in the fixed scope.

## 2. Executive implementation summary

Dizkarte will be a two-sided Filipino task marketplace in which:

1. A verified client manually describes and posts a task with budget, schedule, category, media, and approximate location.
2. Approved taskers discover tasks through a feed, keyword search, filters, and map view.
3. Taskers submit offers and limited pre-booking questions; the client compares offers and tasker profiles.
4. The client selects an offer and pays the agreed amount through the platform.
5. An approved payment provider securely holds or restricts the funds in an escrow-style flow; full private messaging then opens.
6. The tasker completes the work and requests completion confirmation.
7. The client releases the funds, making net earnings available to the tasker.
8. The tasker withdraws available earnings using a supported payout method.
9. Client and tasker submit hidden two-way reviews, disclosed after both reviews or expiry of the agreed review period.
10. Administrators manage verification, safety, content, support, disputes, transactions, refunds, and platform quality.

The recommended delivery shape is a **modular monolith**, not microservices: one cross-platform mobile application for Android/iOS, one protected web administration application, and one Supabase-based backend with isolated business modules. This is the simplest architecture that can meet the schedule while preserving security and future growth.

## 3. Product objectives and boundaries

### 3.1 Required objectives

- Help clients find reliable people for everyday tasks.
- Help taskers find flexible earning opportunities.
- Improve trust through identity verification, tasker approval, protected payments, reviews, reporting, and platform-managed communication.
- Prioritise trust, simplicity, local usability, and Philippine payment/location conventions.
- Deliver Android and iOS applications, an admin dashboard, backend, database, integrations, documentation, deployment, and full turnover.

### 3.2 MVP boundaries

The MVP includes the complete marketplace lifecycle and supporting capabilities described throughout Sections 4–9. It does **not** automatically include later concepts such as business accounts, premium tasker tools, expanded insurance, or unspecified stronger safety features. Those are future scope unless introduced through written change control. Expansion into additional task categories is likewise a future direction after the core marketplace is stable.

The product may use Airtasker only as a conceptual workflow reference. Dizkarte must have original branding, UI, copy, designs, architecture, and implementation and must be adapted for Filipino users; direct copying is excluded.

## 4. Users, roles, and permissions

| Role                                                             | Capability                                                                                                                                                         | Key restrictions                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Visitor (**Proposed; public browsing requires Client approval**) | View only public content expressly approved for unauthenticated access                                                                                             | Cannot post, offer, book, message, pay, review, or see private information          |
| Registered user/client                                           | Manage account; complete ID verification; post/manage tasks; review offers; book/pay; message after payment; confirm completion; review; request support           | Must be authenticated and ID-verified before posting; sees only authorised records  |
| Tasker applicant                                                 | Submit tasker application, identity/selfie, payout/bank details, service areas, specialties, and profile                                                           | Cannot accept paid work until platform approval                                     |
| Approved tasker                                                  | Browse tasks; submit/manage offers; use post-payment chat; complete tasks; view earnings; withdraw; review clients                                                 | Cannot offer if suspended/unapproved; cannot access another tasker’s financial data |
| Admin                                                            | Manage verification, taskers, users, tasks/content, reports, disputes, payments/refunds, revenue, categories, media, and support according to assigned permissions | Least privilege, server-side authorisation, and sensitive-action auditing           |

**Proposed admin permission model, subject to Client approval:** separate support/verification, finance/dispute, and super-admin permission sets rather than giving every administrator full access. Strong authentication is required; multi-factor authentication and dual confirmation for high-risk financial actions are proposed.

**Proposed account model, subject to Client approval:** one person may act as both client and tasker, but tasker privileges remain separately approved and revocable.

## 5. Functional system scope

### 5.1 Accounts, authentication, and identity verification

**Required implementation**

- Registration using email/password and/or approved social login; mobile number is collected.
- Basic profile: full name, mobile number, email, profile photo, city, barangay, credentials, and government ID submission.
- Authentication, sign-in, sign-out, password reset/change, and account-session handling.
- ID verification is required before a user can post a task or apply to become a tasker.
- Visible verification status/badge after approval.
- Personal settings: name, email, mobile, password, photo, location, language preference, notification preferences, payment options, safety preferences, verification status, and profile completeness.
- Users can add, select, and remove supported tokenized payment methods—credit card, debit card, GCash, and Maya—subject to provider capability. Dizkarte must not store raw card or wallet credentials.
- **Proposed account-state model, subject to approval:** active, pending verification, rejected, frozen, suspended, and closed, with authorised transition rules.

**Security acceptance**

- Government IDs and selfies are private and available only to the owner and authorised admins.
- No document-storage URL, service credential, password, or payment credential is exposed publicly.
- Rejection includes a controlled reason and resubmission route.
- Changes to sensitive identity, contact, payout, and account data are validated and audited.

**Decision required:** supported social-login providers, minimum age/eligibility rules, accepted Philippine IDs, verification vendor versus manual review, retention/deletion rules, and account-deletion policy.

### 5.2 Tasker application and approval

A tasker application must collect:

- Full name and mobile number
- Valid government ID and verification result
- Bank/payout details and billing address
- Profile photo and selfie/photo verification
- Service areas and city/barangay coverage
- Specialties and short biography
- Work experience and portfolio photos

Admins can review, approve, reject, request resubmission, and suspend applications. Only an approved tasker can accept paid jobs. The profile presents display/full name according to privacy policy, photo, verified badge, overall rating, completion rate, completed-task count, portfolio, about text, reviews, experience, specialties, service areas, and member-since date.

### 5.3 Client task creation and management

A verified client can create and publish a task. **Proposed management options, subject to approved lifecycle rules:** save a draft, preview it, edit it while permitted, and cancel it. The task form includes:

- Manually written title and detailed description covering specific instructions, expectations, item details, tools needed, and important reminders
- Organisational category without forcing a fixed service template
- Images, videos, screenshots, and approved reference-file types
- City, barangay, optional landmark, and map pin
- Separate private exact address, disclosed only after paid booking
- Preferred date and time
- Fixed or flexible schedule
- Same-day or future scheduling
- Budget in Philippine pesos

**Proposed initial category seed list, subject to Client approval:** delivery and pickup, errands, moving help, handyman, cleaning, assembly, admin and paperwork, event help, business support, pet-related tasks, tech help, and general help.

The public listing shows the title, budget, approximate city/barangay, schedule, category, client rating, status, and offer count. It must never show the exact address, personal contact information, private attachments, or precise private coordinates before payment and booking confirmation. Public task posting must not require an exact address or personal contact details. If a client optionally supplies an exact address during creation, it remains private booking data; otherwise, participants may provide it in post-payment messaging.

**Proposed validation:** required fields, positive budget, valid schedule, allowed/size-limited uploads, map pin within supported service geography, content/PII warnings, and server-side ownership checks.

**Decision required:** edit/cancel rules after offers, minimum/maximum budget, supported service geography, prohibited tasks/items, media/file formats and size limits, content moderation policy, and task expiry.

### 5.4 Discovery: feed, search, filters, and map

Approved taskers can discover available tasks through:

- Paginated task feed
- Keyword search over task title, description, category, city, and barangay as approved
- Filters for location, city, barangay, category, Client-approved task type, budget range, date, same-day, distance, and status
- Sort by newest, highest budget, and nearby
- Map displaying approximate task pins

Search/filter/map results must be mutually consistent and must exclude private, removed, expired, cancelled, already assigned, or otherwise unavailable tasks. Distance uses an approximate public coordinate; exact coordinates remain private until the paid booking authorises access.

**Decision required:** define the task-type taxonomy and whether it is independent of category. If the Client confirms that “task type” and category are synonymous for the MVP, the category field/filter satisfies both source terms; otherwise, task posting, listings, search, and filters must carry the approved separate task-type values.

### 5.5 Offers, pre-booking questions, and selection

An approved tasker can submit an offer containing:

- Proposed price, including acceptance of the posted budget
- Short message
- Estimated completion time
- Relevant experience
- Availability
- Questions/clarifications

Clients can review offers alongside tasker profiles, ratings, completion rates, reviews, and portfolios. Negotiation may cover final price, scope, schedule, tools/materials, timing, and clarifications.

Before payment, communication is restricted to offer-related comments and public task questions. Full private chat, exact address exchange, and contact-detail exchange are blocked. **Proposed abuse control, subject to approval:** detect or flag obvious contact/payment details in pre-booking text for admin review.

Selecting an offer creates a pending booking at the accepted offer price; it does not produce a confirmed booking until payment succeeds. Competing offers close only according to an agreed booking rule, with concurrency protection to prevent duplicate assignment.

**Decision required:** offer edit/withdraw/expiry rules, whether public questions expose tasker identity, and whether a client can select a replacement tasker after payment failure or cancellation.

### 5.6 Booking and lifecycle control

**Proposed task/booking lifecycle — becomes authoritative only after written Client approval**

```text
Task: DRAFT -> OPEN -> BOOKING_PENDING -> ASSIGNED -> IN_PROGRESS
      -> COMPLETION_REQUESTED -> COMPLETED
Alternative terminal/controlled states: EXPIRED, CANCELLED, DISPUTED, REMOVED

Booking: PAYMENT_PENDING -> CONFIRMED -> IN_PROGRESS
         -> COMPLETION_REQUESTED -> COMPLETED
Alternative controlled states: PAYMENT_FAILED, CANCELLED, DISPUTED, REFUNDED
```

Every state transition must be server-authorised, idempotent, timestamped, and recorded with the actor. Clients cannot mark unpaid bookings confirmed; taskers cannot release funds; users cannot alter completed financial records.

### 5.7 Payments, escrow-style protection, ledger, and withdrawals

**Required business flow**

- Client payment methods: credit card, debit card, GCash, and Maya.
- Full agreed task amount is paid when the client finalises the booking.
- Funds are not released immediately to the tasker.
- Successful payment confirms the booking and enables private messaging.
- Tasker requests completion confirmation after completing the task and is prompted to ask the Client to confirm completion and release the funds before the tasker leaves, subject to any approved dispute or safety exception.
- Client confirms completion and releases funds.
- Released net earnings become available in the tasker’s Dizkarte balance.
- Payout/withdrawal methods may include bank transfer, GCash, and Maya.
- Tasker dashboard shows total earnings, pending protected amount, available balance, withdrawn amount, completed-task income, platform fees, pending payouts, and withdrawal history.

**Required implementation safeguard**

“Escrow” is a regulated financial/legal capability, not merely a database status. Dizkarte must not directly custody client money unless the Client has confirmed the legal and regulatory basis. The production design must use a Client-approved payment provider/acquirer that supports the required Philippine methods and an approved hold, delayed-settlement, marketplace, wallet, split-payment, or equivalent protected-funds model. Provider capability and counsel/compliance approval must determine the final terminology and funds flow.

The selected provider flow must satisfy the sourced collection, protected holding/restriction, Client-controlled completion release, tasker balance, refund, and payout outcomes. Any materially different funds flow or terminology requires Client/legal/provider approval and, where it changes the agreed scope, a written change request.

**Proposed transaction model**

- The provider is the source of truth for collection, hold/restriction, refund, and payout status.
- Signed provider webhooks are verified server-side and processed idempotently.
- An append-only internal ledger records gross amount, fees, refunds, tasker payable, withdrawals, and adjustments; balances are derived from ledger entries rather than directly overwritten.
- Client applications receive only provider publishable/session tokens; all secret operations remain server-side.
- Payment, completion, release, refund, dispute, and payout operations use immutable audit records and reconciliation identifiers.
- A withdrawal cannot exceed cleared available balance, cannot spend the same balance twice, and can be frozen during a dispute.
- Failed/duplicate/out-of-order webhooks and interrupted user sessions are recoverable through reconciliation.

**Decision required before integration:** provider, onboarding/KYC, merchant account owner, lawful funds flow, release timing, service/booking fee formula, who pays each fee, taxes/receipts, minimum payout, payout fees, settlement timing, refund policy, cancellation/no-show policy, dispute evidence and resolution rules, chargebacks, partial payments/refunds, automatic release policy, and provider sandbox/production approval.

The 8% tasker fee and optional client protection fee in the specification are examples, not approved production prices.

### 5.8 Post-payment messaging

Private messaging activates only when the booking payment is confirmed. It supports:

- Text chat
- Image and video uploads
- Exact address and contact-detail sharing
- Final instructions and task clarification
- Arrival/progress updates
- Task-completion evidence

Only booking participants and authorised admins handling a report/dispute may access a conversation. Messages are timestamped; uploads are protected by storage policies and short-lived access URLs. Blocking, reporting, moderation access, retention, deletion, maximum size, and allowed file types require approved policy.

### 5.9 Completion, ratings, and hidden two-way reviews

- Tasker submits a completion request, optionally with agreed proof.
- Client confirms completion and initiates payment release.
- Client and tasker can each submit one review for the completed booking.
- Review fields may include stars, comment, reliability, communication, work quality, timeliness, and professionalism as relevant to the reviewed role.
- Neither participant sees the other’s review before submitting their own.
- Reviews become visible when both are submitted or when the configured review period expires.
- Published reviews update overall rating and remain linked to a genuine completed booking.
- Completion rate is the percentage of accepted tasks that the tasker successfully completes; the approved cancellation policy defines which accepted tasks, if any, are excluded from the denominator. Completed-task count follows the same agreed lifecycle rules.

**Decision required:** review-period length, edit/removal/appeal policy, category scoring formula, rating aggregation/rounding, and which cancellations affect completion rate.

### 5.10 Notifications and preferences

Users can configure notifications for new offers, booking updates, messages, payment updates, review reminders, nearby tasks, promotions, and safety alerts.

**Proposed baseline:** in-app notifications plus Firebase Cloud Messaging push notifications for Android/iOS. Events are generated server-side after committed state changes. Users may opt out of optional promotional/nearby alerts; essential account, security, booking, and payment notices remain enabled where legally permitted.

**Decision required:** email/SMS channels, quiet hours, promotional consent, nearby-task radius, templates, and local-language copy.

### 5.11 Help, support, safety, reports, and disputes

The mobile application includes:

- FAQs and contact support
- Report-user flow
- Payment, booking, cancellation, and dispute support
- Safety content covering verification, payment protection, insurance information, legal terms, safety guidelines, reporting, dispute resolution, and platform rules

Users can create tickets/reports, select a reason, describe the issue, attach evidence, and track status as permitted. Admins can triage, assign, communicate, escalate, resolve, and retain an audit trail.

Insurance information must reflect actual approved coverage and must not imply protection that does not exist. Legal terms, privacy policy, prohibited-task policy, dispute policy, and safety copy require Client/legal approval before production.

### 5.12 Tasker dashboard

Once approved, the tasker is shown a clearly visible **Tasker Dashboard** button at the top of the app. An alternative placement requires Client approval. The dashboard includes:

- Available tasks
- Active bookings and completion actions
- Completed tasks and task history
- Earnings, protected/pending amounts, available balance, fees, and withdrawals
- Pending payouts and withdrawal action
- Reviews, rating, and completion rate
- Portfolio and profile settings
- Verification status

All financial totals reconcile to the transaction ledger and provider status.

### 5.13 Admin dashboard

The protected administration application must support:

- ID-verification review
- Tasker application approval/rejection
- User lookup, reports, suspicious-account freeze/suspension
- Posted-task review and suspicious-task removal
- Flagged-content and uploaded-media review
- Dispute management with evidence and status history
- Payment/escrow-style transaction monitoring
- Authorised refund and payout monitoring/management
- Completed-task tracking
- Platform revenue and fee reporting
- Category/filter management
- Help/support ticket management
- Audit-log review

Admin actions require role-based permissions, server-side authorisation, reason capture for material decisions, and audit logs. Raw payment credentials must never be shown or stored.

## 6. Proposed technical architecture

> The source documents mandate deliverable capabilities and identify Supabase and Firebase among turnover assets; they do not prescribe a complete framework. The following is the recommended baseline and requires Phase 1 approval.

### 6.1 Architecture overview

```text
Android/iOS mobile app (client + tasker)
        | authenticated HTTPS / realtime subscriptions
        v
Supabase platform
  - Auth
  - PostgreSQL + Row-Level Security
  - Storage + bucket policies
  - Realtime for authorised chat/status updates
  - Server-side functions/API for privileged workflows
        |             |                 |
        v             v                 v
Payment provider   Maps/geocoding   Firebase Cloud Messaging
(cards/GCash/Maya; approximate map) (push notifications)

Protected web admin -> server-side admin API/functions -> same governed backend
```

### 6.2 Recommended stack

| Layer        | Proposed choice                                                          | Reason                                                                         |
| ------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Mobile       | React Native with Expo, TypeScript                                       | One maintainable codebase delivering Android and iOS within the fixed schedule |
| Admin web    | React/Next.js with TypeScript                                            | Protected, responsive operational dashboard with server-side admin boundaries  |
| Backend/data | Supabase Auth, PostgreSQL, RLS, Storage, Realtime, server-side functions | Explicit turnover requirement; suitable managed foundation for MVP             |
| Push         | Firebase Cloud Messaging                                                 | Firebase is a required turnover asset and FCM supports Android/iOS push        |
| Maps         | Client-approved maps/geocoding provider                                  | Required map pins, geocoding, and distance search                              |
| Payments     | Client-approved Philippine-capable provider                              | Must support required methods and compliant protected-funds/payout workflow    |
| Repository   | Client-owned private Git repository                                      | Full source ownership, traceability, and turnover                              |
| Automation   | CI checks and repeatable Android/iOS/admin builds                        | Reduces release and turnover risk                                              |

Use pinned supported dependency versions at project setup. No production secret or service-role key may be committed or embedded in the mobile app.

### 6.3 Module boundaries

- `identity`: authentication, profiles, IDs, verification, roles
- `taskers`: applications, approval, specialties, service areas, portfolio
- `tasks`: creation, media, location privacy, categories, lifecycle
- `discovery`: feed, search, filters, sorting, distance, map
- `offers`: offers, questions, negotiation, selection
- `bookings`: accepted offer, lifecycle, participant access
- `payments`: provider integration, transactions, ledger, release, refund, reconciliation
- `payouts`: tasker payout methods, withdrawal requests, status
- `messaging`: participant conversations, messages, media
- `reviews`: hidden reviews, publication, aggregate metrics
- `notifications`: in-app records, push delivery, preferences
- `trust-safety`: reports, disputes, moderation, support
- `admin`: protected workflows, configuration, reporting, audit

Modules share one governed PostgreSQL database for the MVP but own their rules and server functions. This avoids premature distributed-system complexity while preserving later extraction options.

### 6.4 Server authority

Sensitive actions must execute through protected server-side functions or database procedures, not direct trust in mobile input. This includes verification decisions, tasker approval, offer acceptance, booking confirmation, payment release/refund, balance movement, withdrawal, review publication, user freezes, and admin actions.

## 7. Proposed information model

All transactional records use clear primary/foreign keys and `created_at`/`updated_at` timestamps where applicable. Financial/audit records are immutable or append-only.

| Domain         | Core records                                                                                                                | Important relationships/constraints                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Identity       | `users`, `profiles`, `addresses`, `verification_cases`, `verification_documents`, `user_roles`, `devices`                   | One auth identity to one profile; private documents; explicit verification state   |
| Taskers        | `tasker_applications`, `tasker_profiles`, `specialties`, `tasker_specialties`, `service_areas`, `portfolio_items`           | Approval gates tasker actions; media owned by tasker                               |
| Tasks          | `tasks`, `task_media`, `categories`, `task_locations`                                                                       | Client owns task; public approximate and private exact location separated          |
| Marketplace    | `offers`, `task_questions`, `offer_comments`, `bookings`, `booking_events`                                                  | Offer belongs to task/tasker; one active confirmed booking per task                |
| Messaging      | `conversations`, `conversation_participants`, `messages`, `message_media`                                                   | Conversation belongs to paid booking; participant-only access                      |
| Payments       | `payment_intents`, `provider_transactions`, `ledger_accounts`, `ledger_entries`, `refunds`, `payout_methods`, `withdrawals` | Provider IDs unique; balanced/idempotent entries; money stored in integer centavos |
| Reviews        | `reviews`, `review_scores`, `rating_aggregates`                                                                             | One review per reviewer per booking; visibility gate enforced server-side          |
| Safety/support | `reports`, `disputes`, `evidence`, `support_tickets`, `ticket_messages`, `moderation_actions`                               | Status history and authorised evidence access                                      |
| Operations     | `notifications`, `notification_preferences`, `admin_actions`, `audit_logs`, `app_settings`                                  | Admin action actor/reason/time recorded                                            |

### 7.1 Data/query requirements

- Index open tasks by status, published time, category, schedule, budget, city/barangay, and geographic position according to actual query plans.
- Index offers by task and tasker, bookings by participant/status, messages by conversation/time, and provider records by unique external ID.
- Use RLS on all user-facing tables and private storage buckets.
- Prevent direct user writes to balances, verification decisions, aggregate ratings, admin roles, and audit records.
- Use database constraints/transactions to prevent duplicate booking, duplicate review, duplicate webhook, and overspending.
- Define backup, point-in-time recovery, migration, retention, archival, and deletion procedures before launch.

## 8. Security, privacy, and trust controls

### 8.1 Minimum controls

- Authentication plus record-level authorisation; never rely on hidden UI alone.
- Least-privilege RLS and admin RBAC.
- Multi-factor authentication proposed as mandatory for admin accounts.
- Client-owned secrets in managed environment settings; separate development, staging, and production credentials.
- TLS in transit and provider/platform encryption at rest.
- Signed, replay-resistant, idempotent webhooks.
- Strict server-side input validation and safe output/error handling.
- Upload allow-list, size limits, content-type verification, malware/moderation approach, private buckets, and expiring URLs.
- Rate limits and abuse controls on auth, posting, offers, messages, reports, payments, and withdrawals.
- PII redaction/moderation in public task and pre-payment communication.
- Audit trail for logins/security events, verification, moderation, finance, role changes, and administrative access.
- Dependency, secret, and source review before release.
- Logs must not contain passwords, tokens, full IDs, exact addresses, card data, or unnecessary personal information.

### 8.2 Privacy separation

| Public/marketplace-safe                                                                                                                          | Restricted/private                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task title/description after moderation; budget; category; city/barangay; approximate pin; schedule; approved profile content; published reviews | Government IDs/selfies; billing and payout data; exact address/pin; direct contact details; private chat/media; support/dispute evidence; provider tokens; admin notes |

Access to restricted data is granted only for the active purpose and authorised role. Philippine Data Privacy Act obligations, consent language, retention periods, data-subject requests, and breach response require Client/legal confirmation.

### 8.3 Safety invariants

1. No task posting before approved ID verification.
2. No paid task acceptance before tasker approval.
3. No exact address or full private messaging before successful payment.
4. No booking confirmation based only on a client-side success screen.
5. No release or withdrawal of uncleared/insufficient funds.
6. No review disclosure before both submissions or period expiry.
7. No admin or user access without explicit role/ownership checks.

## 9. User experience and design direction

The application should be mobile-first, clear, energetic, trustworthy, Filipino, approachable, and not overly corporate. The approved tone should remain **friendly, witty, helpful, reliable, empowering, and street-smart but trustworthy**. It should serve students, young professionals, side hustlers, parents, small businesses, and everyday users.

Phase 1 design output should establish:

- Original Dizkarte visual identity, logo/assets supplied or approved by Client
- Navigation and information architecture for client and tasker modes
- Reusable colour, typography, spacing, icon, form, status, and feedback conventions
- Wireframes/prototypes for registration, verification, posting, discovery, task details, offers, payment, chat, dashboards, review, support, and admin
- Loading, empty, validation, offline/network-error, permission-denied, success, and retry states
- Accessible labels, readable contrast, touch-target sizing, keyboard/screen-reader support where applicable
- English/Filipino copy approach and language preference behavior

**Decision required:** final branding pack, exact copy language(s), accessibility target, supported devices/OS versions, tablet behavior, and Client-provided Airtasker walkthrough/reference materials. Any supplied walkthrough may be used only to refine layout flow, feature placement, task-listing behaviour, offer management, messaging structure, and booking-confirmation flow; it must not be copied.

## 10. Implementation phases and dated delivery plan

The dates below reproduce the Agreement. Written approval and timely Client inputs are dependencies. Scope changes use Section 14 change control.

### Phase 1 — Planning and project setup

**Dates:** 20–21 July 2026  
**Contract milestone:** Milestone 1 — PHP 20,000 (25%), payable only after completion, demonstration, and written Client approval

**Work**

- Confirm source baseline, MVP boundary, users, workflows, acceptance process, and issue log.
- Resolve or assign deadlines for the critical decisions in Section 13.
- Obtain branding, reference materials, app/account ownership details, and Client approvers.
- Approve proposed stack, modular architecture, environments, repository, branch/review rules, and coding conventions.
- **Proposed ownership safeguard, subject to Client approval:** create the Client-controlled private Git repository from project start and add the initial mobile/admin/backend structures.
- Establish development environment, safe configuration templates, CI checks, and issue tracking.
- Produce information architecture, primary user flows, low-fidelity wireframes, and design tokens/direction.
- Produce database ERD/schema plan, RLS/role matrix, storage plan, integration plan, and migration convention.
- Configure Supabase development project and authentication baseline.
- Begin payment-provider, maps, app-store, and Firebase onboarding immediately because approvals may outlast coding.

**Deliverables/exit criteria**

- Approved implementation plan and scope/decision register
- Approved primary UX flows/wireframes and branding direction
- Architecture diagram and database design
- Running project skeletons with authentication setup
- Client-controlled repository and initial account/access register
- Demonstration plus written approval

**Schedule note:** this phase is only two calendar days. Any unprovided branding, provider decision, legal policy, or production account should be logged as an explicit dependency with owner and due date rather than treated as silently approved.

### Phase 2 — Core marketplace development

**Dates:** 22 July–9 August 2026  
**Contract milestone:** Milestone 2 — PHP 20,000 (25%), after demonstration and written approval

**Work**

- Registration, authentication, password/account basics, profile, ID submission, and verification status.
- Complete tasker application/approval, tasker profile, specialties, service areas, experience, and portfolio capabilities.
- Task creation with manual details, category, schedule, budget, media, and public/private location separation.
- Task feed, details, keyword search, required filters/sorts, and availability rules.
- Offer creation, viewing, limited questions/comments, negotiation data, and offer selection.
- Core booking state machine through payment-pending state.
- Complete the sourced Tasker Dashboard: available tasks, active/completed bookings, task history, profile/portfolio, verification, reviews/metrics, earnings, fees, balances, payouts, and withdrawal history. Before Phase 4 provider integration, financial views use tested sandbox/domain data and interfaces rather than placeholders.
- Admin foundations for user verification, tasker approval, users, tasks, categories, and audit actions.
- Unit/integration tests and staging demonstrations for each vertical workflow.

**Exit criteria**

- A verified client can publish and manage a valid task without exposing exact location.
- An approved tasker can find the task and submit an offer.
- The client can review the tasker/offer and select one into payment-pending state.
- Unverified/unapproved/unauthorised actors are blocked server-side.
- Search/filter results, complete Client/Tasker profiles, and the complete sourced Tasker Dashboard are usable and demonstrated, with financial views validated against sandbox/domain data pending Phase 4 provider connection.
- Milestone scope is demonstrated, material defects resolved, and written approval recorded.

### Phase 3 — Advanced features

**Dates:** 10–23 August 2026  
**Contract milestone:** Milestone 3 — PHP 20,000 (25%), after demonstration and written approval

**Work**

- Approximate-location map view and distance/nearby discovery.
- Booking-participant private messaging, text/media, realtime updates, and payment gate.
- Firebase push and in-app notifications with preferences.
- Completion-request and completion-confirmation workflow, initially against sandbox/payment abstraction.
- Hidden two-way review workflow, publication gate, rating, and completion metrics.
- Connect the completed tasker profiles/portfolio and dashboard to ratings, reviews, completion metrics, and notification events.
- Support, reports, safety content, ticketing, and dispute records.
- Complete all sourced admin operations: verification, tasker approval, users, tasks, suspicious-content removal, reports, account freezes, disputes, payment/protected-funds monitoring, refund management, completed-task tracking, platform revenue, categories, uploaded media, and support tickets. Financial operations use the approved sandbox/payment abstraction until Phase 4 provider connection.
- Security/access tests for messaging, locations, IDs, admin routes, and reviews.

**Exit criteria**

- Approximate map pins work without leaking exact addresses.
- Full chat is inaccessible before payment-confirmed status and usable by participants afterward.
- Review secrecy and publication rules pass tests.
- Notifications are generated by authoritative events and respect preferences.
- Admin can perform all required management actions with permission checks and audit records; payment monitoring, refund, and revenue functions operate against the approved sandbox/payment abstraction pending Phase 4 provider connection.
- Milestone scope is demonstrated, defects resolved, and approved in writing.

### Phase 4 — Payment integration, testing, and optimisation

**Dates:** 24 August–6 September 2026  
**Contributes to:** Milestone 4

**Work**

- Integrate approved provider in sandbox, then production-ready configuration for card, GCash, and Maya.
- Implement payment initiation, verified webhooks, booking confirmation, protected status, ledger, reconciliation, completion release, refunds/dispute freeze per approved policy, fees, balances, and withdrawal/payout methods.
- Connect and production-validate the completed earnings, pending amount, available balance, fees, payout, revenue, transaction, refund, and withdrawal views against the approved provider.
- Test payment failures, retries, duplicate/out-of-order webhooks, release, refund, insufficient balance, duplicate withdrawal, and reconciliation.
- Execute complete functional, integration, security, privacy, performance, compatibility, and regression testing.
- Optimise feed/search/map/media/chat performance and operational logging.
- Prepare release candidates, store metadata/assets, privacy disclosures, support details, and deployment runbooks.

**Exit criteria**

- Required payment methods work in the approved provider environment.
- No balance is created from an unverified client callback.
- Ledger/provider reconciliation is explainable for every tested transaction.
- Completion/release and withdrawal work once and only once under retry/concurrency tests.
- No open blocker or critical security defect remains for UAT.
- Android/iOS release candidates and admin staging build are ready.

### Phase 5 — UAT, deployment, and turnover

**Dates:** 7–21 September 2026  
**Contract milestone:** Milestone 4 — PHP 20,000 (25%), only after all listed final deliverables and final acceptance

**Work**

- Run Client UAT against agreed scenarios and record results/evidence.
- Triage defects versus change requests; correct agreed in-scope defects and revisions.
- Final regression, production-readiness, backup/restore, monitoring, and security checks.
- Configure Client-owned production Supabase, Firebase, maps, payment, domain/hosting, support, and app-store accounts.
- Deploy protected admin and backend; build, sign, submit, and deploy Android and iOS applications.
- Deliver source, documentation, build files, signing materials, credentials/access, designs/assets, and knowledge transfer.
- Record formal handover and written final acceptance.

**Contractual final-acceptance conditions**

Final acceptance occurs only after successful UAT, completion of agreed revisions, successful Android and iOS deployment, delivery of all documentation, transfer of all source/repositories/credentials/assets, and completion of turnover.

**External dependency note:** app-store or provider review time is not controlled by software development. Submission must be complete and timely, and any external rejection attributable to in-scope implementation must be corrected. Any date impact from Client inputs or third-party review should be documented promptly under the Agreement.

## 11. Milestone acceptance and demonstration matrix

| Milestone | Contract amount | Demonstration package                                                                                                  | Approval gate                                                                   |
| --------- | --------------: | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1         |      PHP 20,000 | Planning/setup, UX plan, database architecture, authentication, project structure                                      | Completed and demonstrated; Client written approval                             |
| 2         |      PHP 20,000 | Registration, profiles, task posting, browsing, search/filter, offers, tasker dashboard, core workflow                 | Completed and demonstrated; material defects corrected; Client written approval |
| 3         |      PHP 20,000 | Messaging, maps, ratings/reviews, notifications, admin features                                                        | Completed and demonstrated; material defects corrected; Client written approval |
| 4         |      PHP 20,000 | Payment integration, protected payment workflow, testing, deployment, source turnover, documentation, final acceptance | All final-acceptance conditions met and Client written approval                 |

Each demonstration should include: version/build identifier, environment, agreed scenario checklist, test evidence, known non-material issues, decisions/dependencies, and a written approval/rejection record. Silence is not approval.

## 12. Verification and quality plan

### 12.1 Test levels

- **Static checks:** formatting, lint, TypeScript checks, dependency/secret scans.
- **Unit tests:** state rules, fee/balance calculations, visibility gates, validators, review timing, permissions.
- **Database tests:** constraints, migrations, RLS, ownership, private storage, concurrency, rollback.
- **Integration tests:** auth, storage, maps, Firebase, payment sandbox, webhook verification/idempotency, reconciliation.
- **End-to-end tests:** complete client/tasker/admin journeys on staging.
- **Mobile compatibility:** agreed Android/iOS versions, permissions, deep links if used, push, camera/gallery, poor connectivity.
- **Security/privacy tests:** privilege escalation, ID/address/chat leakage, admin access, rate limits, upload abuse, secret exposure.
- **Performance/reliability:** feed/search pagination, map marker volume, chat/media, webhook retries, interrupted payments.
- **UAT:** Client-executed business scenarios with documented expected results.

### 12.2 Minimum end-to-end UAT scenarios

1. Register, verify ID, reject/resubmit, and approve.
2. Block task posting before verification; allow it after approval.
3. Create a task with schedule, budget, media, map pin, and hidden exact address.
4. Find it by keyword, category, approved task type, budget, city/barangay, date, same-day, distance, newest, highest budget, and nearby/map where applicable.
5. Apply/approve tasker; block an unapproved tasker from offering.
6. Submit, compare, negotiate, and select an offer without exposing prohibited contact/address details.
7. Fail/cancel/retry payment safely; confirm booking only from verified provider success.
8. Confirm chat is blocked before payment and available only to paid-booking participants afterward.
9. Complete task, release funds, calculate fees/net earnings, and prevent duplicate release.
10. Withdraw available earnings; prevent insufficient/duplicate withdrawal; show history.
11. Submit reviews in either order; keep them hidden until both or timeout; update rating.
12. Report user/task/message, open support/dispute case, freeze affected activity, resolve/refund under approved policy.
13. Verify admin permissions, reason capture, and audit logging.
14. Verify exact location, IDs, payout details, and private media cannot be accessed by unrelated users.
15. Verify notification categories and user preferences.
16. Verify Android and iOS production builds plus admin deployment and recovery instructions.

### 12.3 Severity and release gates

- **Blocker:** cannot complete a critical flow, data/funds loss, production unavailable, or no workaround.
- **Critical:** security/privacy exposure, unauthorised financial action, serious corruption, or repeatable crash in a core flow.
- **Major:** required behavior materially incorrect with no acceptable workaround.
- **Minor:** limited defect with a safe workaround or cosmetic impact.

No known blocker or critical defect may be released or accepted. Major defects affecting a milestone’s required functionality must be corrected before written milestone approval. Minor issues may be accepted only if documented and scheduled by written agreement.

## 13. Decisions and Client inputs required

### 13.1 Required by Phase 1 or earliest practical date

| Decision/input                                                                             | Why it matters                           | Proposed owner                |
| ------------------------------------------------------------------------------------------ | ---------------------------------------- | ----------------------------- |
| Final branding, logo, colours, content, and reference walkthrough                          | UI/UX and store assets                   | Client                        |
| Client approver and written-approval channel                                               | Contract milestone evidence              | Client                        |
| Mobile framework/admin/backend proposal approval                                           | Project setup and build                  | Both parties                  |
| Client-owned Git, Supabase, Firebase, Apple, Google, maps, hosting/domain accounts         | Ownership, signing, deployment, turnover | Client with Developer support |
| Supported devices/OS versions and languages                                                | Build/test matrix                        | Client                        |
| Accepted IDs, age/eligibility, verification method, retention                              | Onboarding, privacy, safety              | Client/legal                  |
| Supported initial Philippine cities/barangays                                              | Location data and launch operations      | Client                        |
| Prohibited-task/content/media policies and upload limits                                   | Moderation and storage                   | Client                        |
| Payment-provider selection and account application                                         | Critical-path financial integration      | Client with Developer support |
| Lawful “escrow-style” wording and funds flow                                               | Compliance and product claims            | Client/legal/provider         |
| Fee, tax, receipt, cancellation, refund, dispute, chargeback, payout, and release policies | State machine and ledger                 | Client/legal/finance          |
| Review period and moderation/appeal rules                                                  | Review automation                        | Client                        |
| Terms, privacy, safety, insurance, support, and dispute copy                               | Store approval and lawful operation      | Client/legal                  |
| Notification channels and promotional consent                                              | Integration/scope/privacy                | Client                        |
| UAT participants, test data, acceptance scenarios, and availability                        | Final acceptance schedule                | Client                        |

If these inputs are delayed, the Developer should immediately record the blocked item, affected deliverable, workaround if any, decision owner, and revised date. The Agreement permits schedule adjustment for Client-caused delays.

## 14. Delivery governance and change control

### 14.1 Working controls

- One prioritised issue tracker containing requirements, defects, decisions, risks, and change requests.
- Short scheduled progress demonstrations during each phase.
- Versioned acceptance checklist and decision log.
- Written Client approval for each payment milestone.
- Private access only; no public screenshots, videos, demonstrations, code, or project description before official launch.
- Client information and project materials used only to deliver Dizkarte.

### 14.2 Change requests

Any function or modification not expressly included in the agreed sources requires written approval before work. A change request should state:

1. Requested behavior and business reason
2. Difference from current baseline
3. UX, data, security, integration, and operational impact
4. Cost and schedule impact
5. Acceptance criteria
6. Approver and approval date

Bug correction means bringing an included requirement to its agreed behavior. A new capability, changed policy, expanded platform/channel, or materially altered workflow is an enhancement/change request. The parties should classify the item before implementation.

### 14.3 Schedule and delay handling

The Developer is responsible for timely professional delivery. The Client is responsible for timely approvals, feedback, branding, required materials, policies, and account/provider access. A delay notice should identify cause, evidence, critical-path effect, mitigation, and proposed revised schedule. Developer-caused unjustified delay may trigger the Agreement’s revised-schedule or termination rights.

## 15. Environments, deployment, and operations

### 15.1 Environments

- **Development:** non-production data and sandbox integrations.
- **Staging/UAT:** production-like configuration, sandbox/test funds, Client acceptance builds.
- **Production:** Client-owned accounts, least-privilege access, production credentials, monitoring, backups, and release controls.

Never copy real identity documents, payment details, or production secrets into development/test data. Environment variables are documented by name and purpose in a safe template; real values are transferred securely outside source control.

### 15.2 Production readiness

Before launch:

- Production account ownership and billing are confirmed.
- Database migrations and rollback/restore procedures are tested.
- RLS, storage, roles, admin MFA, rate limits, and secrets are reviewed.
- Payment production onboarding, webhooks, reconciliation, refund/payout operations, and support contacts are verified.
- Firebase push credentials, iOS/Android signing, maps restrictions, domains, privacy links, and store metadata are verified.
- Monitoring covers application errors, failed functions/webhooks, notification failures, payment/payout anomalies, and capacity; alerts have named recipients.
- Backup, restore, incident, moderation, dispute, financial reconciliation, and user-support runbooks are delivered.
- Legal/safety/privacy content is approved and accessible.

### 15.3 Release strategy

Use versioned, reproducible builds. Deploy backend/database changes with backward-compatible sequencing where practical, perform staging smoke tests, then production smoke tests for registration, task browse, admin access, notification, and provider health without using real sensitive data unnecessarily. Record build versions, migration versions, release time, operator, and rollback decision.

## 16. Deliverables and complete turnover

At final turnover, the Client must receive ownership and administrative control of:

- Complete mobile, admin, backend, database/migration, test, and automation source code
- Client-owned private Git repository with history
- Supabase project, database, schema/migrations, RLS/storage policies, backup/restore guidance
- Firebase project/configuration
- Maps, payment, hosting/domain, store, and other project-specific integration access
- Environment-variable inventory and securely transferred values/API keys
- Android and iOS build files, signed release builds, signing certificates/keys, and build instructions
- Apple/Google store records and deployment instructions
- UI/UX designs, wireframes, Figma files if used, assets, branding, graphics, and icons
- Admin dashboard, credentials, roles, and operations guide
- Architecture, ERD/data dictionary, integration, API/function, security, testing, deployment, troubleshooting, and maintenance documentation
- UAT evidence, known-issue register, release notes, decision log, and final acceptance record
- Knowledge-transfer sessions and handover checklist

No file, credential, repository, documentation, or access needed to operate, maintain, modify, or deploy Dizkarte may be withheld. The Dizkarte concept, business model, branding, workflows, software architecture, UI/UX, documentation, and associated intellectual property belong solely and exclusively to the Client. Upon final payment, the Developer irrevocably assigns all rights, title, and interest in the Deliverables, including all future modifications completed under the Agreement. The Developer retains no ownership, licence, or continuing right except the limited post-launch portfolio permission in Section 11 of the Agreement; portfolio publication is allowed only after official public launch and must not disclose confidential information or proprietary code.

## 17. Post-launch maintenance

The Developer will provide **60 calendar days** of no-additional-cost maintenance beginning on the official production launch date. It covers only functionality in the agreed scope:

- Bug and error correction
- Performance optimisation
- Compatibility and security fixes
- Deployment support and technical assistance
- General maintenance
- Knowledge transfer and turnover assistance

New features and post-launch enhancements are excluded and require change control.

**Proposed operating procedure:** record official launch date and maintenance end date in writing; submit issues through one agreed channel with reproduction details; classify severity and scope; use staging before production where possible; issue release notes; obtain approval for high-risk production actions. Response/resolution SLAs are not specified in the Agreement and require written agreement if desired.

## 18. Principal risks and mitigations

| Risk                                                                         | Impact                             | Mitigation                                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Payment provider cannot lawfully/supportably hold and pay out required funds | Core workflow/launch blocked       | Select and onboard provider in Phase 1; approve compliant alternative terminology/flow; do not simulate custody |
| Apple/Google/provider/account review delay                                   | Deployment date affected           | Client-owned applications/accounts and submissions prepared early; track external dependencies                  |
| Two-day planning phase leaves decisions unresolved                           | Rework and schedule compression    | Time-box approvals; maintain decision/dependency log; document Client-caused delay                              |
| Broad MVP within fixed PHP 80,000 and nine-week schedule                     | Quality/scope pressure             | Freeze sourced MVP, avoid extras, demo vertically, enforce change control, automate critical tests              |
| ID, address, chat, and payout data leakage                                   | Severe privacy/safety harm         | RLS, private storage, server checks, least privilege, audit/security testing                                    |
| Duplicate/raced payment, release, refund, or withdrawal                      | Financial loss and mistrust        | Idempotency, unique constraints, transactional ledger, webhook verification, reconciliation                     |
| Users move transactions off-platform before booking                          | Revenue and safety loss            | Restrict pre-payment communication; PII/contact detection, reporting, moderation                                |
| Unsettled cancellation/dispute/review rules                                  | Inconsistent state and UAT failure | Client/legal decisions before dependent implementation; encode explicit state rules                             |
| Media storage/moderation costs or abuse                                      | Cost, safety, performance          | Approved formats/limits, private storage, compression, rate limits, moderation and retention policy             |
| Single-developer/knowledge concentration                                     | Delivery and maintenance risk      | Client-owned repo/accounts from start, documentation, automated builds/tests, frequent turnover                 |
| Connectivity/device variation                                                | Failed field workflows             | Retry-safe operations, progress/error states, agreed device matrix, poor-network testing                        |
| Third-party outage or pricing change                                         | Service interruption/cost          | Provider abstraction at business boundary, monitoring, documented configuration and recovery                    |

## 19. Scope-to-delivery traceability

| Source requirement group                                                       | Implementation section |                           Primary phase |
| ------------------------------------------------------------------------------ | ---------------------- | --------------------------------------: |
| Registration, authentication, client/profile settings, ID verification         | 5.1, 6–8               |                                     1–2 |
| Tasker registration, approval, profile, portfolio, dashboard                   | 5.2, 5.12              |                                       2 |
| Manual task posting, category, media, location, schedule, budget               | 5.3                    |                                       2 |
| Feed, search, filters, nearby and map                                          | 5.4                    |                                     2–3 |
| Offers, questions, negotiation, tasker selection                               | 5.5                    |                                       2 |
| Booking and task lifecycle                                                     | 5.6                    |                                     2–4 |
| Card/GCash/Maya, protected funds, release, balance, withdrawal                 | 5.7                    |                     1 decision; 4 build |
| Messaging only after paid booking                                              | 5.8                    |                                       3 |
| Two-way hidden reviews, ratings, completion metrics                            | 5.9                    |                                       3 |
| Notifications and user preferences                                             | 5.10                   |                                       3 |
| Help, support, reports, disputes, safety/legal/insurance content               | 5.11                   |                                       3 |
| Admin verification, users, tasks, reports, finance, categories, media, support | 5.13                   | 2–3; provider connection validated in 4 |
| Android/iOS, documentation, deployment, turnover                               | 10 Phase 5, 15–16      |                                       5 |
| UAT, revisions, final acceptance                                               | 10 Phase 5, 11–12      |                                       5 |
| 60-day maintenance                                                             | 17                     |                             Post-launch |
| Confidentiality, ownership, no unauthorised reuse/publicity                    | 14, 16                 |                          Entire project |

## 20. Definition of done

A feature is done only when:

- Its sourced behavior and approved acceptance criteria are implemented.
- Loading, empty, error, success, offline/retry, and permission states are handled as relevant.
- Authentication, ownership, role, privacy, input, upload, and abuse controls are enforced server-side.
- Automated tests cover critical happy, failure, and edge cases; affected integration flows pass.
- User-facing copy and accessibility are reviewed.
- Schema/API/configuration changes are migrated and documented without embedded secrets.
- It is deployed to staging, demonstrated, and has no unresolved blocker/critical defect.

The project is complete only when all contractual final-acceptance conditions in Phase 5 are met, Milestone 4 is approved in writing, all assets/access are transferred, and the 60-day maintenance commencement date is recorded.

---

## Appendix A — Immediate kickoff checklist

- [ ] Name Client approver and written approval channel.
- [ ] Approve this implementation baseline or record amendments.
- [ ] Supply/approve branding and reference materials.
- [ ] Approve the proposed Client-controlled account strategy and create/transfer Git, issue-tracker, Supabase, Firebase, Apple, Google, maps, payment, hosting/domain access accordingly.
- [ ] Approve architecture, stack, environments, role matrix, and core state machines.
- [ ] Select and begin onboarding payment provider.
- [ ] Approve launch geography, IDs, eligibility, fees, release, cancellation, refund, dispute, payout, and review policies.
- [ ] Approve privacy, terms, safety, prohibited-task, insurance, moderation, and retention content.
- [ ] Agree device/OS/language matrix, notification channels, media limits, and UAT availability.
- [ ] Record owners and due dates for every unresolved item.

## Appendix B — Source-grounded exclusions pending written approval

The following must not be assumed included merely because they are common marketplace features: web marketplace for clients/taskers, desktop client portal, recurring/subscription tasks, business accounts, premium tasker tools, bidding automation, AI matching, live GPS tracking, voice/video calls, multi-currency, promo/referral programs, loyalty systems, insurance underwriting, background checks beyond the approved identity flow, tax filing, accounting integrations, multilingual translation beyond the approved language behavior, or any payment method/provider not approved above. Any such addition requires written scope confirmation or change control.
