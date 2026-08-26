# Change Log

Records material scope/implementation changes. Follows the Agreement + approved
written changes as the source of authority.

## 2026-08-25 - Milestone 4 dependency request issued

`docs/acceptance/milestone-4-decision-request.md` (new). Milestone 4 covers payment
integration, escrow workflow, testing, deployment, turnover, and final acceptance.
The code for collection, release, refunds, and payouts already exists and fails
closed — a Xendit adapter, four edge functions (`payment-checkout`,
`payment-webhook`, `payment-refund`, `payment-payout`), and the money RPCs
(`process_payment_event`, `confirm_completion_and_release`, `request_withdrawal`,
`admin_refund`, `admin_freeze`, `open_dispute`) over the append-only ledger.

What is missing is not code: it is a provider account and a set of money policies.
The request document separates the two so the Client can act on them independently,
and states a **minimum unblock set of six items** (sandbox key + webhook secret,
refund/cancellation rules, fee decision, release model, maps key, push
credentials) rather than presenting one undifferentiated list.

It also records what happens to unanswered items, which is the important part: an
unanswered refund rule leaves the action **refused** with honest copy, an
unanswered fee stays at **zero** with the receipt line marked pending, and a
missing credential leaves the feature reporting **"not configured"**. No default is
invented, because an invented number looks authoritative on a receipt.

Documentation only — no code, schema, or test change.

## 2026-08-24 (loop closed) - a decided report now tells the reporter

`submit_report` (0048) gave the reports queue a producer and `admin_read_report_subject`
(0049) made it triageable, but the loop still ended in silence: an Admin moved a
report to ACTIONED or DISMISSED and the person who filed it was never told. In a
trust & safety flow that is the worst place to go quiet — someone who reports
harassment and hears nothing reasonably concludes nobody looked.

### Migration `0050`

`admin_transition_report` is restated from 0013 with one added block; everything
else is byte-for-byte the same logic (assigned-Admin-only, reasoned, idempotent by
`(admin, action, key)`, same allowed transition set, both `moderation_actions` and
`audit_logs` rows).

- **Terminal outcomes only.** ACTIONED and DISMISSED notify; TRIAGED does not.
  Telling a reporter "your case is now TRIAGED" leaks how the queue works and gives
  them nothing to act on.
- **The Admin's private `reason` is never forwarded**, and no party is named. The
  copy is the honest limit of what a reporter may know about someone else's
  account: "we reviewed it and have taken action; we cannot share details."
- **Exactly once.** The existing idempotent-replay early return is what prevents a
  second notification, so a retried Admin action cannot double-message anyone.
- An Admin who reported something and then handled it themselves is not notified
  about their own decision.
- **The reported user is not notified.** There is no defined content-removal or
  account-restriction consequence in the product (blocking is policy-blocked under
  D13/11.5), so such a message would describe an outcome that does not exist.
- `REPORT_RESOLVED` is mapped onto the existing **`system`** preference toggle
  rather than a new `safety` category — one event type does not justify another
  switch on the preferences screen — and is listed explicitly in
  `app.notification_category` instead of relying on the `else` branch, so a future
  rename cannot silently move which toggle governs it.

### Two mislabels found and fixed while wiring the client side

Both would have shipped silently:

1. `toNotificationType` whitelists event types and falls back to
   `MESSAGE_RECEIVED`. A report decision would therefore have appeared in the
   inbox as **"New message"** — worse than showing nothing, because it is
   confidently wrong. `REPORT_RESOLVED` is now in the union, the mapper list, and
   a test that pins the passthrough.
2. `toNotificationResourceType` whitelists resource types, so `report` collapsed
   to `null` and the row lost its safety icon. Added, with the resource type in the
   mobile union and `pushCategoryForType` kept in lockstep with the SQL function
   (a mismatch there would push a category the user muted in-app).

The report sheet's success copy now says the user will be notified of the decision —
which only became true with this migration.

**Validation:** `typecheck:all`, `lint`, `format` clean; **690 tests pass** (179
shared + 156 Admin + 355 mobile, 3 skipped); `mobile:export` green. The
`admin_case_subject` suite grew to **15/15** with five new checks: a dismissal
notifies once with the right copy, the Admin reason does not leak, no party is
named, a replayed decision does not notify twice, TRIAGED stays silent, ACTIONED
gets its own copy, and a reporter who muted `system` receives nothing. All eight
suites pass with 52 migrations applying from empty; bundle regenerated
(`0001..0050`); CI comment counts updated.

## 2026-08-24 (Admin backend) - case pages now resolve what a case is ABOUT

The Admin console could name a case subject only as its type plus eight characters
of a UUID: `message 3f2a1b9c`, `booking 7c14a2de`. Every page was already backed by
the real repository (verified: only `access-restricted`, a static notice, does not
call `getAdminRepository`), so this was not a missing-page problem — it was a
missing *reference*. A support Admin triaging the reports that migration `0048`
started producing could read the reporter's narrative but not the reported message,
and a finance Admin opening a dispute saw neither the parties nor the task.
Deciding a case therefore meant querying the database by hand, which is slow and,
worse, unaudited.

### Migration `0049`

- **`app.case_subject_json(resource_type, resource_id)`** — one internal resolver
  for all five reportable types plus bookings. Returns the same key set for every
  type (label, status, body, parties, task, booking, amount, type-specific extras)
  so the console renders one component rather than five special cases. Not granted
  to any client role.
- **`admin_read_report_subject`** and **`admin_read_dispute_subject`** — audited,
  assignment-scoped entry points following the exact shape 0013 established:
  reason + idempotency key mandatory, only the **assigned** Admin (capability alone
  is not enough — `ADMIN_SUPER` who is not the assignee is refused), and
  `audit_read_once` so a page reload does not inflate the audit trail.
- **Reporter identity and volume**, disclosed to the assignee only: who filed it,
  how many reports they have filed, how many were dismissed, and — for the reported
  resource — how many *distinct* people reported it and how many cases were already
  actioned. Who else complained is not disclosed; how many did is what separates a
  single complaint from a coordinated pile-on.

Disclosure limits held deliberately: display names, statuses, amounts, timestamps,
and aggregate counts only — **no mobile number, email, exact location, or storage
path** (asserted by the suite, which fails if a `+63917…` or an address ever
appears in the payload). A message *body* is included, because moderating content
you cannot read is not moderation, and the assigned Admin can already read the whole
transcript through `admin_read_conversation_messages`.

**A deleted resource is a normal outcome, not an error.** Content can be removed
after a case is filed, so the resolver degrades to `exists: false` with "This
message no longer exists" and the case stays decidable on its narrative, evidence,
and history.

### Admin app

- `mapCaseSubject` / `mapReportTriage` narrow the payload field by field rather
  than casting across the PostgREST boundary, recover a `bigint` amount that
  arrived as a string, and never invent zeros — `mapReportTriage` returns `null`
  when the block is absent, because "no other reports" and "we could not tell"
  must not look identical to a moderator.
- New shared `CaseSubjectCard` renders the three honest states (not the assignee /
  deleted / resolved), with the text under review in a visually separated
  `blockquote` so a reported message is never mistaken for Admin copy, and deep
  links into the app's own records (`/users/[id]`, `/bookings/[id]`).
- The list label and the report detail header now name the subject and the reporter
  instead of `(protected)` — the assignment-scoped read is the only path that
  discloses either.
- **Found and fixed a real leak in the synthetic adapter:** `applyCaseAccess`
  withheld `narrative`/`evidence` from a non-assignee but would have passed the new
  `subject`/`triage` straight through, disclosing reported content and a reporter's
  name to an Admin who is not the assignee. On the server the RPCs simply refuse;
  the synthetic adapter now strips both on the same terms, checked by a test.

**Validation:** `typecheck:all`, `lint`, `format` clean; `admin:build` compiled;
**690 tests pass** (179 shared + 156 Admin + 355 mobile, 3 skipped) — 11 new Admin
tests covering the mappers and the access gate. New
`supabase/tests/admin_case_subject.sql` passes **10/10** and all eight suites pass
with 51 migrations applying from empty: 4/4, 3/3, 30/30, 14/14, 8/8, 6/6, 10/10,
10/10. Suite registered in `npm run test:sql` and the CI `database` job; bundle
regenerated (`0001..0049`).

## 2026-08-24 (final pass) - "Request a quote" gets its brief-description step

Closes the last in-scope item from the Airtasker reference audit. The CTA itself
already existed on the public Tasker profile (added in parallel work earlier the
same day) but jumped straight into the posting wizard with nothing carried over, so
the reference's intermediate step — describe the task, *then* post — was missing.

- **One sheet now serves both entry points.** `RebookSheet`'s `booking` prop became
  optional: with a booking it is "Book {name} again" and offers "use details from
  last task"; without one it is "Request a quote from {name}" and hides that row,
  because there is no prior task to copy. Both paths end the same way — the brief
  is carried into `/task/create` as the prefilled title (plus the previous
  category when rebooking).
- **The copy stays honest about what happens.** Neither path is a private,
  tasker-directed hire, and neither shows a fabricated "quote sent" toast: the hint
  says plainly that this posts a task that the named Tasker *and other nearby
  Taskers* can quote on. A Client who believed they had hired someone privately
  would be wrong about who can see their task, which is the kind of thing worth
  spending a sentence of UI on.
- **The one non-visual decision is extracted and tested.**
  `buildQuoteTaskParams` moved into the framework-free `quoteTaskParams.ts` (the
  convention already used by `taskFilterQuery.ts` and `bookingStatusPresentation.ts`)
  after an initial attempt to test it in place failed — importing the `.tsx` pulls
  React Native into the pure test environment. It gates on the 25-character minimum
  (whitespace padding does not count), truncates to the task-title limit rather than
  letting the wizard reject the brief a screen later, and omits `category` entirely
  when none is known.

**Validation:** `typecheck:all`, `lint`, `format` clean; **679 tests pass** (179
shared + 145 Admin + 355 mobile, 3 skipped) including six new `buildQuoteTaskParams`
cases; `mobile:export` green. No migration and no SQL change: this path reuses the
existing public-task flow, which is exactly why it needed no new backend surface.

### Reference audit closed

Every in-scope divergence found against `docs/video_recordings/` is now either
implemented or explicitly dispositioned:

| Reference item | Outcome |
| -------------- | ------- |
| Multi-step posting wizard with dynamic per-category questions | Already implemented (`0038`) |
| My Taskers + rebook | Already implemented (`RebookSheet`, home carousel) |
| Browse filters, list ↔ map parity | Already implemented; "no offers yet" added (`0047`) |
| Offers/Questions tab counts | Already implemented (owner surface only, by design) |
| Messages inbox | Equivalent by design (Bookings tab); preview + unread added (`0046`) |
| Finish registration before offering | Already implemented (`0034`) |
| Receipt with fee/tax lines | Implemented; fee/tax render as pending under **D3**/**B7** |
| Report content | Implemented this pass (`0048`) |
| Request a quote from a profile | Implemented this pass |
| Block a user | **Out of scope** pending policy (D13 / 11.5) |
| Tasker tiers + earnings graph | **Out of contracted scope** → change control |
| Third-party ID verification | Deliberate divergence: manual Admin review, truthful copy |

## 2026-08-24 (later still) - `reports` gets a producer, and the direct INSERT path is closed

Follows the open finding recorded in the previous entry. The `reports` table has
existed since 0007, the Admin queue consumes it, and 0013 built assignment-scoped
audited narrative/evidence reads for it — but **nothing in the product ever created
a report**. The only writer in the repository was a seed script, and the app offers
support *tickets* only, so the Admin reports queue could not receive a real report.

### `submit_report` (migration `0048`)

An RPC rather than a client insert, because the existing `reports_insert` policy
(0009) was not enough. It accepted **any** `resource_id` — including a message,
booking, or offer the reporter could not see — so a stranger could open an audited
Admin case about private content they had no view of, with no volume bound, and the
table's CHECK constraints surfaced as raw constraint errors rather than the app's
`VALIDATION_ERROR` contract.

The RPC answers one question per resource type: *could this reporter legitimately
have seen the thing they are reporting?*

| Resource | Rule |
| -------- | ---- |
| `message` | reporter participates in that conversation, and it is not their own message |
| `task` | publicly listed (`OPEN`), owned by the reporter, or they are party to its booking |
| `offer` | the task owner, or the Tasker who made it |
| `booking` | a participant |
| `user` | any active account may report another; never yourself |

Other properties: narrative bounds (10–4000) and both enum sets are validated in
the RPC so the caller gets the app's error contract; a suspended or banned account
cannot file; and **one live case per (reporter, resource)** — a second submission
returns the existing `OPEN`/`TRIAGED` row instead of stacking duplicates on the
queue, while re-reporting becomes possible once the earlier case closes, which is
the legitimate "it happened again" path.

**A refusal never doubles as a probe.** An invisible resource, a non-existent one,
and yourself all fail identically, so the error cannot be used to discover which
messages, bookings, or offers exist.

**The direct INSERT policy is dropped**, making the RPC the only writer — the same
shape as `notifications`, where `app.notify` is the sole path. Reads are untouched:
reporter, assignee, and capability-scoped Admin reads stay exactly as 0009/0013 left
them, and the service role (seeds) bypasses RLS as before.

### UI

Long-pressing a counterpart's message in chat opens a report sheet: reason chips
mapped 1:1 to the `category` CHECK, a narrative field whose validation mirrors the
server bounds (so the disabled Submit and the RPC agree on "enough detail"), and
plain copy about consequences — a report opens a review by the Dizkarte team; it
does **not** hide the message, block anyone, or change the booking. Overstating
that in a safety flow would be the worst place to be vague. Long-press is invisible
to a screen reader, so the same action is also published as an accessibility action
on the bubble. Your own messages get no report affordance at all.

**Block-a-user remains out of scope.** Blocking a counterpart during a live paid
booking has refund and completion consequences that decision D13 / blocker 11.5
have not settled; building it now would invent policy.

**Validation:** `typecheck:all`, `lint`, `format` clean; **673 tests pass** (179
shared + 145 Admin + 349 mobile, 3 skipped) including six synthetic-adapter tests
(participant reports counterpart message and gets one case; duplicate returns the
same case; own message refused; non-participant message and booking refused;
self-report refused; narrative bounds refused before any write); `mobile:export`
green. **New `supabase/tests/report_submission.sql` passes 10/10** and all seven
suites pass with 50 migrations applying from empty: 4/4, 3/3, 30/30, 14/14, 8/8,
6/6, 10/10. CI and `npm run test:sql` run the new suite; bundle regenerated
(`0001..0048`).

**Still open from the reference audit:** "Request a quote" from a Tasker profile
(the customer→Tasker initiation path; the mechanism already exists as
`RebookSheet`, which starts an ordinary public task rather than a directed
assignment) and Tasker tiers/earnings graph (outside contracted scope → change
control).

## 2026-08-24 (later) - "No offers yet" browse filter, and the per-viewer `offer_count` defect it exposed

### The filter (migration `0047`)

`search_task_feed` gains `p_no_offers_only`, the one browse filter the Airtasker
reference has that this feed did not. It serves the short side of the market: a
Tasker hunting winnable work wants the tasks nobody has quoted yet. Threaded
through the shared `taskSearchSchema` (`noOffersOnly`), the single
`buildTaskSearchQuery` builder used by **both** the feed and the map, the filter
panel (as a switch, with an applied-filter chip), and both repositories.

The old 15-argument signature is **dropped explicitly** before the new one is
created. `create or replace` with an added parameter leaves the previous signature
in place as a separate overload, and PostgREST resolves overloads by the argument
names a caller supplies — so the app could have kept binding to the old function
and the new filter would have silently done nothing. The suite now asserts that
exactly one `search_task_feed` exists and that it carries the parameter.

### The defect the filter uncovered: `offer_count` was a viewer fact, not a task fact

`public_task_feed` is `security_invoker = true`, and `offer_count` was an inline
`select count(*) from offers ...`. Offer rows are private per viewer — the task
owner sees all, a Tasker sees only their own, anyone else sees none — so that
subquery was evaluated under the **reader's** RLS:

- the task owner saw the true count;
- **a Tasker browsing saw `0` on every task except their own**;
- a signed-out or unrelated viewer saw `0` everywhere.

So the offer count on a browse card was already wrong for the audience that reads
it most, independently of this filter — and a "no offers yet" filter built on it
would have matched every task. This was caught by writing the test as an unrelated
viewer rather than as the task owner.

Fixed by delegating the count to `app.task_submitted_offer_count(uuid)`
(`SECURITY DEFINER`, `STABLE`), so it reflects the task rather than the reader.
The disclosure is deliberately narrow: the helper returns **a number and nothing
else**. Who quoted, at what price, and with what message stay governed by the
existing per-viewer `offers` policies — the suite asserts both halves, that an
unrelated viewer now sees the true count *and* still reads zero offer rows.
`public_task_feed` was recreated verbatim from 0008 with only that column changed,
and `security_invoker` re-asserted so every other column keeps being read under
the caller's own RLS.

**New suite `supabase/tests/task_feed_filters.sql` (6/6):** one-and-only-one
`search_task_feed` carrying the parameter; the count is a task fact while offer
rows stay private; only zero-offer tasks are returned and the set genuinely
narrows; absent/null/false all behave as "off"; the filter composes with
same-day and budget predicates instead of overriding them; and the page-size clamp
plus private-location exclusion still hold on this path.

**Validation:** `typecheck:all`, `lint` clean; **667 tests pass** (179 shared + 145
Admin + 343 mobile, 3 skipped) including a schema test that the flag is optional
and boolean-only, a builder test that "off" is omitted from the wire entirely (the
feed and map compare query objects for parity, so an explicit `false` would be a
different query), and a synthetic-feed test that the filter both returns
zero-offer tasks and actually narrows the set; `mobile:export` green. All six SQL
suites pass with 49 migrations applying from empty: 4/4, 3/3, 30/30, 14/14, 8/8,
6/6. CI and `npm run test:sql` both run the new suite; bundle regenerated
(`0001..0047`).

### Open finding, not fixed here: reports have no producer

While scoping the reference's per-message "report" action I found that **nothing in
the mobile app ever creates a `reports` row**. The table exists (0007, with
`resource_type` already allowing `message`), the Admin queue consumes it, and 0013
built assignment-scoped audited narrative/evidence reads for it — but the only
writer anywhere in the repo is a seed script. The app offers support *tickets*
(`submitSupportTicket`, subject task or booking) and no report path at all, so the
Admin reports queue cannot receive a real report from the product.

This is the same class of gap as the notification producers fixed on 2026-08-23
(written, tested, and called by nothing) and is worth its own pass: a
`submit_report` RPC needs a defensible visibility rule per resource type (you may
only report a message in a conversation you participate in), duplicate suppression
so it cannot become a spam primitive, and then the UI affordances. Recorded here
rather than half-built. **Block-a-user remains out of scope pending policy** — a
block during a live paid booking has refund and completion consequences that
decision D13/blocker 11.5 have not settled.

## 2026-08-24 - Conversation read state: last-message preview and unread badge on the Bookings list

Closes the last real divergence found when auditing the app against the Airtasker
walkthrough references in `docs/video_recordings/`. Two of the four items I had
listed turned out to be **already implemented** and were struck from the gap list:

- **Offers/Questions tab counts** exist — `app/task/[id]/owned.tsx` renders an
  `ActivityTab` per section with `count={offers.length}` / `count={questions.length}`
  inside a `role="tablist"` bar. My earlier check had only looked at the *public*
  task detail, where the counts are deliberately absent: a Tasker sees only their
  own offer there, so a total would leak competitive information.
- **A Messages inbox** is not a missing screen. A conversation is 1:1 with a
  booking (`uq_conversation_booking`) and exists only after payment confirms, so
  the Bookings tab already **is** the conversation list, with search, filters and
  a route into each chat. Adding a Messages tab would duplicate it and, for most
  new users, show an empty screen.

What was genuinely missing was the *inbox affordance* on those rows: no preview of
the latest message, no per-conversation unread indicator, and two taps to reach
chat.

### The blocker was data, not UI

Unread was only ever modelled per NOTIFICATION (`notifications.read_at` on a
`MESSAGE_RECEIVED` row), which answers "have you looked at your inbox?", not "does
this conversation have messages you have not read?". Rendering a badge from that
would have meant fetching every message of every booking to the client and
computing it there.

- **Migration `0046`** adds `conversation_participants.last_read_at` (the
  participant's own high-water mark) and two functions:
  - `mark_conversation_read(uuid)` — participant-only, idempotent, and
    **monotonic**: a stale or retried call can never pull the mark backwards and
    make already-read messages unread again. A stranger and a non-existent
    conversation get the *same* refusal, so the error cannot be used to probe
    which bookings exist.
  - `conversation_summaries()` — one bounded row per conversation the CALLER
    participates in. It takes **no argument**: the scope is `auth.uid()` inside
    the function, so there is no parameter to tamper with.
- **Two deliberate exclusions in the read model.** Only `APPROVED` messages are
  previewed or counted, so a message an Admin moderated away cannot reappear as
  preview text; and the preview is truncated to 140 characters **in SQL**, so a
  list query can never become a bulk content transfer. The full body remains
  readable only inside the conversation.
- `service_role` is excluded from both functions: they resolve the caller through
  `auth.uid()`, so a service-role call carries no identity and would silently
  return nothing. (The first version of this migration granted only to
  `authenticated` and revoked from `anon` — which the new suite immediately caught
  as insufficient, because `create function` grants EXECUTE to PUBLIC and `anon`
  inherits it. Now revoked from PUBLIC first, then re-granted, matching the 0013
  convention.)

### UI

The Bookings row gains a full-width, 44 px-tall preview line — "You: …" or
"Ramon: …", or "Photo" for a media-only message — that taps **straight into
chat**, with a literal unread count in a pill (never colour alone, R14). The row
renders exactly as before when there is nothing truthful to show: no conversation
yet, or no message sent. Conversation activity is fetched as a **separate** read
from the booking list, so a failed summary query never blanks the payment and
completion actions the user came for. The chat screen marks the conversation read
on open and again whenever a message arrives while it is open, then bumps the
shared revision so the list badge clears without polling.

**Validation:** `typecheck:all`, `lint` clean; **656 tests pass** (178 shared + 145
Admin + 333 mobile, 3 skipped) including six new synthetic-adapter tests
(counterpart-only unread, symmetry, reopen-after-read, media-only preview,
non-participant returns nothing and cannot create read state, chat-not-unlocked
excluded); `mobile:export` green. **New `supabase/tests/conversation_read_state.sql`
passes 8/8** against a real PostgreSQL 17.6, and all five suites pass with 48
migrations applying from empty: 4/4, 3/3, 30/30, 14/14, 8/8. CI and
`npm run test:sql` both run the new suite; the migration bundle was regenerated
(`0001..0046`).

**Note on concurrent work:** while this was being implemented, another editor was
active in `apps/mobile/src/components/booking/` (a booking-status presentation
extraction: `bookingStatusPresentation.ts`, `BookingStatusWorkspace.tsx`). That
work targets the booking **detail** screen and does not overlap the list row
changed here, but the two touch neighbouring files and should be reconciled in one
commit.

## 2026-08-23 (later the same day) - The sweeps now actually run, and Milestone 3 has an evidence package

Follow-on to the gap-closure entry below. Three loose ends, one of which made the
preceding work inert.

### 1. Four server sweeps were invoked by nothing

`expire_stale_payment_pending` (0027), `emit_review_reminders` (0043),
`sweep_stale_completion_requests` (0044), and the push retry queue
(`due_push_retries`, 0044) were all written, tested, and **called by nothing**: no
`pg_cron` schedule, no scheduled workflow, no runbook. A sweep that never runs is
indistinguishable from an unimplemented one — abandoned checkouts would have held
a task's one-active-booking slot indefinitely, and the review/completion reminders
added hours earlier would never have fired.

- **Migration 0045** adds `app.ensure_scheduled_jobs()`, which schedules all four
  (checkout expiry every 15 min; review reminders hourly at :15; completion sweep
  hourly at :35; push retry every 10 min — staggered so no two start in the same
  second). It is idempotent: re-running it after a cadence change converges on the
  same schedule.
- **Extensions are deliberately not created by the migration.** `pg_cron` needs
  `shared_preload_libraries` and, on hosted Supabase, is enabled from the
  Dashboard; a migration that assumed it would fail on CI and on disposable test
  databases. Without `pg_cron` the migration succeeds, logs a NOTICE, and reports
  `{"scheduled": false, "reason": "pg_cron_not_installed"}` — so enabling it later
  is a single documented command, not a migration rewrite.
- **No secret in a scheduled command.** The push retry needs an HTTPS call, so the
  cron entry invokes `app.dispatch_push_retries()`, which reads
  `push_dispatch_url`/`push_dispatch_secret` from Supabase Vault at run time and
  **no-ops with a NOTICE when they are unset** — the correct behaviour while push
  credentials remain a Client-owned blocker (B4), and never a fabricated call.
- **New runbook `docs/operations/scheduled-jobs.md`**: what each job does and why
  its cadence, how to enable `pg_cron`/`pg_net`/Vault, verification queries
  (`cron.job`, `cron.job_run_details`), manual invocation (every sweep returns a
  count, so "did it do anything?" needs no log reading), monitoring signals,
  pause/concurrency/timezone/bounds notes, and the external-scheduler fallback.
  `deployment-backup-rollback.md` now links it and adds "enable the schedule" as
  deployment step 5.

**Verified against a real database, both ways.** With `pg_cron`/`pg_net`/Vault
installed: all four jobs appear in `cron.job` as active, a second
`ensure_scheduled_jobs()` leaves exactly four, every scheduled command executes
cleanly by hand, `dispatch_push_retries()` returns `false` with the documented
NOTICE while Vault is empty and `true` once both secrets exist (one row queued in
`net.http_request_queue`), and no secret appears in `cron.job.command`. Without
`pg_cron`: all 47 migrations still apply and the guarded path reports the expected
reason.

### 2. The database evidence was not reproducible on demand

- **New `scripts/run-sql-suites.mjs` + `npm run test:sql`** applies the storage
  shim and every migration to a throwaway `supabase/postgres` container, runs all
  four suites, prints per-suite pass counts, and exits non-zero on any failure. It
  reads no connection string from the environment and removes the container
  afterwards (`--keep` to debug, `--image` to pin a different tag), so it cannot
  touch a real project.
- **CI**: the `database` job now runs `milestone3_reviews_notifications` alongside
  the other three suites, and documents `npm run test:sql` as the fallback for
  hosts where `supabase start` cannot bind its ports.
- The Milestone 3 suite gained a **scheduling section** (now 14 checks): the new
  wiring is not client-callable, `ensure_scheduled_jobs()` always returns a
  verdict — scheduled, or a documented reason — and a push dispatch cannot claim
  success without `pg_net`.

### 3. Milestone 3 had no submission package

**New `docs/acceptance/milestone-3-evidence.md`**, structured as the nine items
§10 of the phase analysis requires: build identifier, demonstration environment
and account roles, a 19-row requirement/exit-gate checklist with evidence per row,
the automated and manual test summary (including what is explicitly *not*
verified), Phase 3 security/privacy checks, defects fixed (D-1…D-8) and
limitations accepted as non-material, decisions/dependencies (D3, D13, B1–B10, and
the now-overdue payment-onboarding target), documentation updated, and a Client
disposition block.

It records one honest process gap: **265 files are uncommitted**, so the cited
commit hash does not describe the code being demonstrated. That must be committed
and tagged before sign-off — a milestone submission needs an immutable identifier.

`traceability.md` was updated for R9/R10/R11/R14 to point at `0042`–`0045` and the
new tests.

**Validation:** `format`, `lint`, `typecheck:all` clean; 629 tests pass (178 + 145
+ 306, 3 skipped); `npm run test:sql` green — 47 migrations apply from empty and
the suites report 4/4, 3/3, 30/30, **14/14**. The scheduling behaviour above was
verified by direct inspection of `cron.job` and by executing each job command.
Not verified: an actual `pg_cron` tick firing on its own schedule (that needs a
10–15 minute wall-clock wait on a live database) and real APNs/FCM delivery (B4).

## 2026-08-23 - Milestone 3 gap closure: review secrecy in the public rating, push device registration, the two missing notification producers, completion timeout, and push retry

A scan of the Milestone 3 scope (contract items *Messaging · Maps ·
Ratings/Reviews · Notifications · Admin*, plus the Phase 3 waves 3A–3D and the
Phase 3 exit gate in `Dizkarte-Implementation-Phase-Analysis.md`) against the
delivered system found waves 3A (geospatial + chat) and 3D (admin) meeting their
exit criteria, and five defects across 3B/3C. All five are fixed here.

### 1. A hidden review moved the Tasker's PUBLIC rating

Requirement R10 and the exit gate both say a review stays secret until both
participants submit or the window expires. The review *text* was withheld
correctly — but the *score* was not. `submit_review` (0011) incremented
`tasker_profiles.rating_sum`/`rating_count` at insert time, while the row was
still `HIDDEN`, and `public_tasker_profiles.rating_average` (0008) is derived from
exactly those columns. Anyone comparing offers could watch a Tasker's average
move — and, with `rating_count` public, infer that a review had landed and roughly
what it said — before the blind window closed.

- **Migration 0042.** The aggregate now counts `REVEALED` rows only and is
  **recomputed** (`app.recount_review_aggregate`) rather than nudged by deltas.
  Recomputation is idempotent, so it cannot drift, double-count, or go negative —
  which is also why 0023's `greatest(0, ...)` guards are no longer load-bearing.
  `submit_review`, the lazy expiry reveal in `get_review_pair` (0021), and
  `admin_moderate_review` (0023) all converge on that one function, and a one-time
  backfill corrects any average written under the old rule.
- **A latent 0023 defect surfaced while testing this**: `admin_moderate_review`'s
  `restore` branch built its target status from two bare literals, so the `CASE`
  resolved to `text` and the `UPDATE` failed at runtime — there is no implicit
  `text → review_status` cast. Restore had never been exercised by a test. It is
  fixed (explicit casts) and now covered.

### 2. Push was dead end-to-end: nothing ever registered a device

The server side was complete (the 0020 producers, the `devices` table, the
`push-dispatch` edge function) and the port declared
`registerPushDevice`/`disablePushDevice` — but **nothing in the app ever called
them**, and nothing acquired a device token. `devices` stayed empty, so every
dispatch took the "no devices" branch. This was developer-owned work, distinct
from the Client-owned APNs/FCM credentials (blocker B4).

- **New `src/services/push/`**: `registration.ts` holds the whole decision table
  (unsupported platform, undetermined→prompt, denied, no credentials, malformed
  token, write failure) behind an injected `PushRuntime`, so it is unit-tested
  without an Expo/React Native transform; `expo-runtime.ts` supplies the real
  `expo-notifications` + `AsyncStorage` implementation through the same lazy
  `require` pattern the marketplace factory uses; `index.ts` exposes idempotent
  `syncPushRegistration` / `releasePushRegistration`.
- **`expo-notifications ~57.0.13`** added to the mobile app (matching the SDK 57
  line, as with every other Expo module here).
- **Registration happens on sign-in** (`NotificationsProvider`) and is
  **revoked immediately before sign-out** (`SessionProvider`). The ordering is
  deliberate: `devices` writes are RLS-scoped to the caller's own rows, so after
  `auth.signOut()` the row could never be disabled — and a still-enabled row would
  deliver the previous user's pushes to a phone somebody else has signed into.
- **The preferences screen now tells the truth.** It previously always claimed
  "Push delivery is in development mode"; it now reports this device's actual
  state (active / blocked in device settings / not configured yet / unsupported
  platform / failed).

### 3. Two Wave 3B notification producers did not exist

- **`REVIEW_REMINDER`** had no type, trigger, or schedule: after the one-time
  "leave a review" line inside `BOOKING_COMPLETED`, nothing ever reminded a
  participant, so the blind window could expire in silence. Migration 0043 adds
  `emit_review_reminders`, a service-role-only sweep (elapsed time is not a row
  change, so a trigger cannot express it) that reminds each participant who has
  not reviewed, at most once per booking, and only while the review can still be
  submitted.
- **`NEARBY_TASK`** existed only as a preference toggle: 0031 widened the category
  CHECK to allow `nearby`, but nothing ever wrote such a notification, so the
  switch governed nothing. Migration 0043 adds a publication trigger with a
  deliberately conservative recipient rule — approved, active, non-owner Taskers
  whose declared service area matches the task's **public** locality (never a
  radius query on the private point), bounded fan-out, one row per
  (task, recipient), and the title as the only task detail carried.
- **Routing was corrected for both.** The notifications screen mapped every
  `task`-scoped row to the *owner* screen, which would have denied the very
  Taskers a nearby alert is sent to; type-specific destinations now come first.

### 4. Completion had no timeout path, and a failed push was lost forever

- **Completion timeout (0044).** A Tasker could request completion and, if the
  Client never returned, the booking sat in `COMPLETION_REQUESTED` indefinitely
  with the funds protected and nobody informed. `sweep_stale_completion_requests`
  now reminds the Client after 48h and, after 168h, escalates: an immutable
  `booking_events` row (exactly-once via the existing
  `uq_booking_event_idempotency`), an audit entry, and a notification to both
  sides pointing at support.
  **It deliberately does not auto-confirm, auto-release, or move any money.**
  Automatic release is an unapproved commercial/legal policy (**D13** / blocker
  **11.5**); implementing it would fabricate a funds-flow rule the parties have
  not agreed. The escalation record states `funds_moved: false` in its own
  metadata so it can never be misread as a release, and the SQL suite asserts
  both the unchanged status and the unchanged ledger.
- **Push retry (0044).** `push-dispatch` wrote `FAILED` and stopped, so a
  transient Expo 5xx lost the push permanently. `notifications` gains
  `delivery_attempts`, `next_attempt_at`, and a bounded `delivery_error`;
  `record_push_delivery` owns attempt counting, exponential backoff (2, 4, 8 …
  capped at 60 minutes), and the terminal decision; `due_push_retries` exposes
  only what is actually due. The backoff schedule is mirrored (and unit-tested) in
  `@dizkarte/domain`'s `push-delivery` module. A push that exhausts its attempts
  is allowed to stay failed — the in-app notification is the durable channel.
  `no_devices` is now recorded as `SUPPRESSED` rather than `SENT`: truthful, and
  it keeps a permanently undeliverable row out of the retry sweep.

### 5. The exit-gate cases with no test

New `supabase/tests/milestone3_reviews_notifications.sql` (13 checks, all passing)
covers: server-only execute boundaries on the new functions; a hidden review not
moving the public rating; reveal publishing exactly the revealed score; the
**unauthorised** review read; the **timeout** case (a one-sided review revealing
on expiry, and only then entering the aggregate); moderation hide/restore
recount + replay; review reminders once per participant and suppressed when the
category is muted; nearby alerts reaching only matching Taskers and not repeating
when a task returns to `OPEN`; the completion timeout's reminder → exactly-once
escalation with no status or ledger change; and push retry counting, backoff,
ceiling, and clearing. The mobile suite adds the expiry-reveal (clock advanced
past the deadline) and non-participant cases against the synthetic adapter, whose
`getReviewPair` now **persists** the expiry reveal instead of only reporting it.

### Two pre-existing SQL suites had rotted

Neither failure was caused by this work; both predate migrations added since
`0014` and were fixed so the suites are runnable evidence again:
`ledger_and_constraints` used `FEE_CHARGE` fixtures that 0036's
`ck_ledger_tx_booking_scoped` now rejects without a `booking_id` (switched to the
deliberately booking-free `ADJUSTMENT` type), and `security_hardening` inserted
`profiles` rows that 0015's `handle_new_user` already creates (now an upsert).
`supabase/tests/_local_storage_shim.sql` was added so the suites can also run
against a disposable Postgres container, which ships the `storage` schema but not
its tables.

**Validation:** `typecheck:all`, `lint` clean; `format` clean across all source
(the only remaining Prettier warnings are the generated `expo-env.d.ts` and the
local `android/.cxx` build output); **629 tests pass** (178 shared + 145 Admin +
306 mobile, 3 live-integration skipped); `admin:build`, `mobile:config-check`, and
`mobile:export` all green. **All 46 migrations apply from scratch against a real
PostgreSQL 17.6 (supabase/postgres image, disposable container)** and the four SQL
suites pass: `ledger_and_constraints` 4/4, `rls_enabled` 3/3,
`security_hardening` 30/30, `milestone3_reviews_notifications` 13/13. The
migration bundle was regenerated (`0001..0044`). Not verified by automated test:
real APNs/FCM delivery to a physical device, which needs the Client's push
credentials (B4) — the code path up to and including the registered token is
tested, the wire is not.

## 2026-08-21 - Milestone 2 gap closure: portfolio visibility, task cancellation, and two fields the wizard was discarding

A scan of the Milestone 2 scope (contract items *User Registration · User
Profiles · Task Posting · Marketplace Browsing · Search · Filtering · Offer
System · Tasker Dashboard · Core Marketplace Workflow*, plus the Phase 2 waves in
`Dizkarte-Implementation-Phase-Analysis.md`) against the delivered app found the
scope substantively complete, with four defects. All four are fixed here.

### 1. A Tasker's portfolio was invisible when comparing offers

Phase 2 Wave 2C requires "Client offer comparison with tasker profile, rating
placeholders/empty states, **and portfolio**". The database already allowed it —
`portfolio_items_select` (0009) grants any authenticated user read access to rows
whose `moderation_status = 'APPROVED'` — but the mobile client had no way to ask:
`listMyPortfolio` is owner-scoped and `PublicTaskerProfile` carries no portfolio.

- **New port read `listPublicPortfolio(userId)`** returning **approved items
  only**, implemented in both repositories. A pending or rejected work sample
  stays visible to its owner alone; moderation is not bypassed to fill a gallery.
- **`app/profile/[id].tsx` now shows a portfolio gallery**, each image resolved
  through a short-lived signed URL because the `portfolios` bucket is private.

### 2. A Client could not cancel their own task

The lifecycle has always permitted `DRAFT/OPEN → CANCELLED`
(`packages/domain/src/state/task.ts`) and an Admin could already remove a task
(`admin_moderate_task`, 0016), but the task's own owner had no such command, so a
Client who no longer needed a job had to leave it open and let Taskers keep
quoting.

- **New `cancel_own_task` RPC (migration 0040).** Owner-only, active-account
  only, idempotent, and restricted to `DRAFT`/`OPEN`. It locks the task row so it
  cannot interleave with `select_offer`, rejects every still-live offer (with an
  `offer_events` row and a courtesy notification each) so no Tasker is left
  believing they are still in the running, and writes an `audit_logs` entry.
- **Deliberately pre-payment only.** Any state from `BOOKING_PENDING` onward is
  refused: money or a commitment is attached and the outcome depends on the
  cancellation/refund policy that remains **open decision D13**. Nothing here
  invents a penalty, fee, or refund. Abandoning an unpaid booking keeps its own
  narrow path (`cancel_unpaid_booking`, 0027).
- **UI**: a "Cancel this task" action on the owned-task screen, shown only while
  the task is cancellable, behind a confirmation that states how many offers will
  be closed.

### 3. The posting wizard discarded the Online/In-Person choice

The wizard has always offered "In Person" vs "Online", but the choice lived in
screen-local state. The only trace of a remote task was the literal string
`"Online / Remote"` written into the public `landmark`, so nothing could tell a
genuinely remote task from one whose landmark happened to read that way, and the
choice was lost on reload.

- **`tasks.location_type` (migration 0041)**, `not null default 'in_person'` with
  a CHECK mirroring `taskLocationTypeSchema`, threaded through the domain schema,
  DTO, form, wizard, both repositories, and the task detail display.
- An online task still records a city/barangay: the locality is what makes a task
  regionally discoverable and `task_public_locations` requires it. The flag
  changes the *meaning* — for a remote task the locality is where the Client is,
  not where the Tasker must appear.

### 4. The removals drop-off was collected and then thrown away

The wizard asks removals Clients for a drop-off location and discarded it on
submit.

- **`task_public_locations.dropoff_landmark` (migration 0041)**, exposed through
  the `task_locations_readable` view (recreated verbatim from 0017 with the one
  new column) and surfaced on the review step and task detail.
- **Stored at public, area-level precision only — never an exact address.**
  `task_public_locations` is readable through the public feed, so a second
  precise address here would defeat the approximate/exact separation that
  requirement R4 exists to protect. The wizard therefore persists the
  selection's public area label and drops the exact address it also had. If an
  exact drop-off is ever required it belongs beside `exact_address` in
  `task_private_locations`, behind the confirmed-booking gate.

### Known Milestone 2 deviations left open (not defects)

- **Post-payment cancellation** is withheld pending **D13**.
- **Wave 2D mentions "fees"** in the earnings views; these render as zero because
  **D3** sets `platform_fee_bps = 0` pending an approved fee model.
- **The "Tasker Dashboard" contract item** is delivered as distributed surfaces
  (Browse / Bookings / Profile → Earnings) under the Client-approved alternative
  recorded as **D15** — no dashboard screen exists by design.

**Validation:** `typecheck:all`, `lint`, and `format` clean (the only formatting
warning is the pre-existing generated `apps/mobile/expo-env.d.ts`); full suite
green; `expo export` builds. Migrations 0039–0041 were applied and asserted
against a real PostgreSQL 17 instance in a disposable container — see the
production-readiness review. Not verified by automated test: the visual layout of
the new gallery and cancel dialog (no UI test harness in the mobile app).

## 2026-08-15 - One account, one app: Tasker dashboard removed (D8, D15)

Every account signs in as a Client and the same person can also work as a
Tasker, so the role-split home is gone. `app/(tabs)/home.tsx` still branched on
`isApprovedTasker` and rendered a full `TaskerDashboard` — the last remnant of
the earlier role-split design that the always-present `Browse` / `My Tasks` tabs
replaced. Approved Taskers (e.g. `tasker@dev.dizkarte.invalid`, Ramon Bautista)
therefore never saw the Client home at all.

- **Home is now the same for everyone** — the action-first "what do you need
  done?" hub. Tabs remain `Home · Browse · My Tasks · Bookings · Profile` with no
  role switch.
- **`TaskerDashboard.tsx` deleted.** Its content was distributed rather than
  dropped: available work was already the **Browse** tab, and bookings on either
  side were already the **Bookings** tab, so only the genuinely earning-side
  parts needed a home.
- **New `app/earnings.tsx` ("Earnings & payouts").** Ledger-derived balance,
  the mini-stats, `WithdrawalPanel`, rating/completion tiles, and the offer
  history. Not yet an approved Tasker → the same `TaskerApplicationPrompt` the
  Browse tab shows, so "become a Tasker" is never a dead end.
- **Profile gained a "Work & Earnings" section** linking Earnings & payouts and
  Manage portfolio. `/portfolio` was previously reachable *only* from the
  dashboard and would otherwise have become orphaned.
- **Data layer renamed** to drop the dashboard concept:
  `getTaskerDashboard` → `getTaskerWorkSnapshot`, `TaskerDashboardSnapshot` →
  `TaskerWorkSnapshot` (port + both repositories + tests). The projection's
  fields are unchanged, so its three repository tests still cover the same
  booking-status transitions.
- **Spec note.** `Dizkarte-Proposed-System.md` §5.12 specifies a prominent
  "Tasker Dashboard" button and says an alternative placement requires Client
  approval. That approval is recorded as **D15**; the contract/spec documents
  themselves are left as the agreement of record and are not rewritten.

**Validation:** mobile typecheck; 237 mobile tests green; eslint clean apart
from two pre-existing errors in untouched files. Not verified by automated test:
the visual layout of the new Earnings screen (no UI test harness in the mobile
app).

## 2026-08-15 - Fixed a fabricated ledger release (MoneyError crash)

**Symptom.** The mobile app crashed with
`MoneyError: Amount cannot be negative.` whenever a screen rendered the Tasker's
derived balances.

**Root cause (found in live data, not guessed).** Booking
`fd675f10-…` (₱100.00) was released **twice**: once by the real
`confirm_completion_and_release` RPC (`rel_<booking_id>`, booking-scoped) and
once by an ad-hoc service-role insert (`seedrel_1786453015687`) with its own
idempotency key and a **null `booking_id`**, so the RPC's key could not
de-duplicate it. Both transactions balanced to zero, which is all the existing
deferred trigger checks, but the Tasker's `PROTECTED_HOLD` was debited twice
against a single capture: derived `protected` became **-₱100.00** and
`TASKER_AVAILABLE` was credited ₱100.00 no Client ever paid. `formatPhp`
correctly refuses negative amounts, so the dashboard threw on render.

**Fixed:**

- **Database (`0036_ledger_integrity_guards.sql`).** Zero-sum per transaction is
  not enough to stop money being conjured into a user's account, so three
  additive guards: booking-scoped transactions must name their booking
  (`ck_ledger_tx_booking_scoped`, `NOT VALID` so immutable history is untouched);
  partial unique indexes allow **one capture and one release per booking**
  regardless of the caller's idempotency key; and a deferred, `SECURITY DEFINER`
  constraint trigger (same RLS reasoning as `0033`) rejects any insert that
  leaves an **owner-held** balance negative. Platform contra accounts
  (`CLIENT_FUNDING`, `PLATFORM_FEE`, `REFUND_CLEARING`, platform payout sink) are
  exempt because they are expected to run negative.
- **New `ADJUSTMENT` ledger transaction type** (SQL enum + `LEDGER_TRANSACTION_TYPES`
  + Admin unions). An append-only ledger cannot delete a bad entry; the absence
  of a "this corrects a recorded error" type is what made breaking immutability
  look like the only cleanup route.
- **Repair (`scripts/repair-ledger-double-release.mjs`).** Reverses fabricated
  releases with one balanced `ADJUSTMENT` per offending transaction, keyed
  `adj_reverse_<tx_id>` (idempotent). Nothing is deleted or edited; both the
  error and its correction stay in the audit trail. Supports `--dry-run`.
- **Presentation (`formatPhpSigned`).** Derived balances, ledger nets, and
  reconciliation differences are *aggregates*, not amounts being created, so a
  negative value is information to surface, not invalid input — and must never
  take a screen down. Used for the mobile Tasker balance/mini-stats and
  withdrawal available figure, and for the Admin reconciliation **Difference**
  column, revenue rows/ledger net, and dashboard ledger balance (the Admin
  reconciliation view was guaranteed to crash on any negative difference).
  `money()`, `assertAmountInBounds`, and `formatPhp` stay strict for every amount
  that is created or moved.

**Validation:** `npm run build`, `typecheck:all`, `lint` (clean apart from two
pre-existing errors in untouched files), 170 root + 145 Admin + 237 mobile tests
green, new `formatPhpSigned` unit tests, and the repair script's `--dry-run`
verified against the live project (identifies exactly one fabricated release).
Not executed: migration `0036` and the repair write path against the live
project — both are Client-authorized operations on real financial data.

## 2026-08-14 — Canonical PSGC city/barangay pickers (resolves D14)

Replaced the dev "type a raw PSGC code" placeholder (e.g. `137404`) — which no
ordinary Philippine user would know — with **name-searchable city/municipality
and barangay pickers** backed by the official dataset. Approved source (D14):
**PSA Philippine Standard Geographic Code** via the open `psgc.gitlab.io`
snapshot, version pinned by fetch date in `scripts/load-psgc.mjs`.

- **Data (migration `0035` + loader).** New reference tables
  `psgc_cities_municipalities` (1,634) and `psgc_barangays` (42,046), authenticated
  read-only under RLS, service-role writes. `scripts/load-psgc.mjs` fetches the
  snapshot and derives the app's stored codes (6-digit `city_code`, 9-digit
  `barangay_code`); loaded with **0 orphaned barangays**.
- **Picker (`LocalityPicker`).** Users search by name ("Quezon City",
  "Commonwealth"); the picker stores the official codes behind the scenes and
  scopes barangays to the chosen city. Wired into **tasker Service area**,
  **profile**, and **task creation/edit** (single-page + guided wizard),
  replacing every raw-code input.
- **Fixed a real discovery bug.** Task creation previously hardcoded
  `DEFAULT_CITY_CODE = 137404` (Quezon City) for **every** task, so city/barangay
  filters were meaningless. Tasks now carry the Client's actual PSGC city +
  barangay (both required by `publicLocationSchema`). Verified live: a Cebu City
  task filters in under `072217` and is excluded from Quezon City results.
- **Validation:** mobile typecheck; 237 mobile tests (wizard/step/draft fixtures
  updated for the now-required city/barangay); eslint/prettier clean; live PSGC
  search + filter round-trip (6/6).

## 2026-08-14 — "Finish registration" offer gate + Airtasker-style Browse/My Tasks split

Two Client-directed alignments to the Airtasker reference the Client supplied on
video.

**Navigation — Browse and My Tasks are now separate tabs.** The single
capability-aware `work` tab was split into two always-present tabs, matching the
reference's `Browse` + `My tasks`. Bottom nav is now
`Home · Browse · My Tasks · Bookings · Profile`; Notifications moved off the tab
bar to the existing header bell. Nothing was removed — `TaskerDiscoveryFeed`,
`TaskerDashboard`, `ClientMyTasks`, and `TaskerApplicationPrompt` were only
re-homed (dashboard/prompt extracted into their own components).

**Offer gate — "Finish registration" before making an offer.** Mirrors the
reference: an approved, identity-verified Tasker must additionally provide three
self-service items before the offer form unlocks — a **mobile number**, a
**bank (payout) account**, and a **billing address**. New mobile screens: a
checklist (`/finish-registration`) that reflects live completion and links to
three capture screens (`/registration/mobile|bank|billing`). The gate is
enforced **both** client-side (the offer form is replaced by a "Finish
registration" prompt until complete) **and server-side** — `submit_offer`
(migration `0034`) now fails closed with a `REGISTRATION_REQUIRED` error until
all three exist, so the gate is real, not cosmetic.

- **Data model (`0034`).** New `billing_addresses` (owner-only RLS) + RPCs
  `save_registration_mobile` (PH-format validated + normalized), `add_payout_method`,
  `save_billing_address`, and `my_offer_registration_status` (drives the dynamic
  checklist). `submit_offer` rebuilt to add the three readiness checks after the
  existing capability/approval/verification checks.
- **Payout-token boundary preserved.** "Add a bank account" is masked to its last
  four digits **on the device**; only the provider + a masked label are sent, and
  the server stores an opaque token (`chk_payout_no_raw_card` is an added
  backstop). No raw account/card credential is ever transmitted or stored. Live
  payout delivery and SMS one-time-code verification remain provider-gated
  (B2/SMS provider); the number is captured and format-validated in the meantime.
- **Verified end-to-end (live sandbox project):** removing an item blocks
  `submit_offer` with `REGISTRATION_REQUIRED`; completing all three unlocks a real
  published-task offer (7/7 checks). Existing identity-verification and manual
  Tasker-approval gates (SoW) are unchanged and still apply first.
- **Validation:** workspace + admin + mobile typecheck; 237 mobile + 145 admin
  tests; eslint/prettier clean.

## 2026-08-12 — Xendit refund + payout finalizers wired; ledger release bug fixed (SANDBOX)

Completes the provider-authoritative money-out path left as a follow-up by the
sandbox pass below. The **finalizers** — the webhook → ledger RPC steps that
actually move money — are now wired for refunds and payouts and verified
end-to-end in sandbox. Live dispatch stays gated on B2/counsel and on the
provider key scope (see below); the authoritative finalizer core is testable
and proven regardless.

- **Webhook routing by kind.** `payment-webhook` now branches on a `?kind=`
  query param (`payment` | `refund` | `payout`) to the matching authoritative
  RPC — `process_payment_event`, `process_refund_event`, `process_payout_result`
  — because Xendit invoice/refund/disbursement statuses overlap (e.g. `FAILED`).
  Refunds match by `reference_id` (the refund idempotency key set at dispatch);
  disbursements match by `external_id` (the `withdrawal_id`). Deployed
  `--no-verify-jwt` (Xendit sends no Supabase JWT).
- **Dispatch functions.** New `payment-refund` (finance-admin: records the
  `admin_refund` intent, then calls Xendit `/refunds`) and `payment-payout`
  (dispatches a RESERVED withdrawal to Xendit `/disbursements`). Both fail
  closed and mark the row PROCESSING; the webhook is the single source of truth
  for the terminal state.
- **Admin refund entry point.** The payments console Refund action now dispatches
  through `payment-refund` (was a `PROVIDER_UNAVAILABLE` stub); the Refund button
  is enabled.
- **Tested spec extended.** `@dizkarte/domain` Xendit helpers gain
  `xenditEventKind`, `translateXenditRefund`, and `translateXenditDisbursement`
  (16 unit tests), mirrored inline by the Deno functions.
- **Verified end-to-end (sandbox):** refund — `admin_refund` → Xendit refund
  webhook → booking `REFUNDED` + `REFUND` ledger reversal; payout — reserved
  withdrawal → disbursement `FAILED` webhook → withdrawal `FAILED` +
  `WITHDRAWAL_REVERSE` ledger reversal, and a second → `COMPLETED` webhook →
  withdrawal `PAID` + provider reference recorded.
- **Ledger release bug fixed (migration `0033`).** Found and fixed a pre-existing
  correctness/security bug that made it **impossible for any Client to release
  escrow to a Tasker**. The balance-check runs on a DEFERRED constraint trigger,
  so it fires at COMMIT as the invoking role — outside the SECURITY DEFINER RPC
  that posted the entries. `ledger_entries` RLS only exposes rows for accounts
  the caller owns, so when a Client released funds the trigger (running as the
  Client) saw zero of the Tasker's two entries and wrongly raised "must have at
  least two entries". Service-role webhook paths bypass RLS and were unaffected,
  which is why only the client-initiated release failed. Fix: make
  `app.assert_transaction_balanced()` SECURITY DEFINER with a pinned
  `search_path` so the integrity invariant always evaluates over the full
  transaction, never caller-visible rows.
- **Live gating (honest limits).** Live payout dispatch additionally needs a
  Money-out:Write provider key and recipient-account/KYC handling we deliberately
  do not store (payout-token boundary); live refund dispatch needs refund
  permission on the key. These remain B2/counsel-gated. The mobile withdrawal /
  payout-method-management UI is a documented KYC-gated follow-up (not built);
  only the finalizer + dispatch function exist for payout.

## 2026-08-11 — Xendit payment provider wired (SANDBOX)

The payment architecture — always provider-agnostic (`PaymentProvider` port +
provider-authoritative `payment-webhook` → `process_payment_event` ledger RPC) —
now has a concrete **Xendit** integration wired for **sandbox**. Live money
movement remains gated on the Client-owned legal model (blocker B2); this pass
adds the technical integration only and stays fail-closed in production.

- **Server-side checkout** — new `payment-checkout` Edge Function: authenticates
  the booking's client, creates a Xendit **invoice** (hosted GCash/Maya/card
  checkout) with the secret key held **only** server-side, then persists
  `payment_intents.provider = 'xendit'` + `provider_reference = <invoice id>` so
  the authoritative webhook can match confirmation to the intent. Fails closed
  when no provider is configured; never confirms a booking itself.
- **Webhook** — `payment-webhook` extended with a `static_token` scheme
  (Xendit's `x-callback-token`) and a Xendit-payload → canonical-event
  translation (invoice `PAID`/`SETTLED` → confirm, `EXPIRED`/`FAILED` → fail;
  disbursement/refund statuses mapped) before the existing idempotent,
  replay-safe `process_payment_event`.
- **Tested spec** — `@dizkarte/domain` gains pure, unit-tested Xendit helpers
  (amount conversion, invoice-request shape, webhook translation) mirrored inline
  by the Deno functions (the same pattern the HMAC verifier already uses, since
  the edge runtime cannot import the workspace bundle).
- **Mobile** — the real `createCheckoutSession` now invokes `payment-checkout`;
  the payment screen opens the hosted checkout (in-app browser) and polls the
  authoritative state for a sandbox/live session, while keeping the synthetic
  simulator for offline development. `EXPO_PUBLIC_PAYMENT_MODE=sandbox`.
- **Required Edge secrets** (set via `supabase secrets set`): `PAYMENT_MODE=sandbox`,
  `PAYMENT_PROVIDER=xendit`, `PAYMENT_API_KEY=<Xendit sandbox secret>`,
  `PAYMENT_WEBHOOK_SECRET=<Xendit callback token>`,
  `PAYMENT_WEBHOOK_SIGNATURE_SCHEME=static_token`,
  `PAYMENT_WEBHOOK_SIGNATURE_HEADER=x-callback-token`.

Still Client+counsel-owned (B2/B7): the fund-custody/"protected hold" model
(platform custodies client funds in its provider balance and disburses later),
fees, refund/cancellation/dispute/chargeback rules, payout-recipient KYC, and
therefore live activation. Payout (disbursement) and refund finalizers against
Xendit are a follow-up gated on those decisions.

## 2026-08-09 — Live maps, Tasker onboarding, and self-service gaps closed

Frontend/backend feature work built on the executed database, all wired to the
real Supabase project (no synthetic fallbacks) and validated (mobile typecheck +
227 mobile tests + config tests + ESLint/Prettier; new migrations applied to the
live project and exercised end-to-end via signed-in round-trips).

- **Maps / geocoding provider is live (blocker B3, resolved for geocoding).** A
  Client-owned Google Cloud key + billing account were provided. The key is held
  **server-side only** as the `GOOGLE_MAPS_SERVER_KEY` secret behind a new
  `geocode` Supabase Edge Function (authenticated-only, input-validated, never
  leaks the key). The mobile app runs `MAP_MODE=live` and geocodes through the
  proxy (`EdgeGeocodingMapProvider`); the legacy bundled-key path is retired.
  Task creation and nearby discovery now resolve real coordinates.
- **Visual map.** The Nearby view renders a real interactive map — Leaflet +
  OpenStreetMap on web (`TaskMapSurface.web.tsx`), approximate pins only, popups
  linking to the task; native keeps the labeled approximate-marker fallback.
- **Tasker application submission (real).** New `submit_tasker_application`
  SECURITY DEFINER RPC (migration `0030`) assembles + submits an application to
  the Admin queue atomically (specialties, service area, payout-provider
  preference), replacing a previous local `setTimeout` no-op. Seed now enriches
  the in-review applicant with real specialties + a service area.
- **Profile reads / avatars.** Migrations `0028` (private `avatars` bucket) and
  `0029` (`public_profiles` view for safe cross-user display names/avatars).
- **Settings.** Change-password (Supabase auth, shared `passwordSchema`),
  read-only account email, and a profile-completeness indicator.
- **Notification alert categories.** Added the spec's opt-in categories —
  nearby tasks, promotions, safety — end to end (migration `0031` widens the
  `notification_preferences` category check; port/adapters/UI extended).
- **Tasker portfolio management.** Self-service work-sample CRUD against the
  existing private `portfolios` bucket + `portfolio_items` (owner-partitioned,
  moderation `PENDING` on upload, signed-URL rendering); reachable from the
  Tasker dashboard.
- **Admin operational settings editor.** New super-Admin-only, audited
  `admin_update_setting` RPC (migration `0032`) with a strict allow-list — today
  only `review_reveal_days` (operational). The console Settings page now edits it
  and records each change to `audit_logs`. Money/release policy
  (`platform_fee_bps`, optional client fee, auto-release) is shown **read-only**
  with a pending-approval note and is refused by the RPC, keeping D3/D5/D13
  Client-owned.
- **Dependency hygiene.** Root `overrides` pins `@types/react` to a single
  version across the workspace, resolving a duplicate-types conflict that broke
  the Admin typecheck/build (the caret-range dedupe risk flagged in the
  readiness review).

Migrations added this cycle: `0028`–`0032` (all applied to the live project).
Not changed: money/release policy defaults remain client-owned (D3/D5/D13).

## 2026-07-22 — Database executed against real Postgres (local Supabase)

The full migration chain and SQL suites were run for the first time against a
real PostgreSQL/Supabase stack (pinned Supabase CLI v2.109.1 + Docker, local
ephemeral DB). Migrations `0001`–`0014` apply cleanly; all three suites pass:
`ledger_and_constraints` 4/4, `rls_enabled` 3/3, `security_hardening` 30/30.

Defects that only real execution surfaced, and their fixes:

- **Migration ordering.** `0001` defined `app.current_capabilities`/
  `app.has_capability`/`app.is_admin` (`language sql`) whose bodies read
  `public.user_capabilities`/`public.profiles` (created in `0002`). PostgreSQL
  validates SQL-function bodies at creation, so migration failed with "relation
  does not exist". The three helpers were relocated verbatim to the end of
  `0002`; `0001` keeps a pointer note.
- **Missing schema USAGE.** Nothing granted `usage on schema app`, so every RLS
  predicate calling `app.*` would fail with "permission denied for schema app".
  Added `grant usage on schema app to anon, authenticated, service_role;` in
  `0001`.
- **Missing base-table privileges.** The API roles had no table privileges, so
  `authenticated` requests failed with "permission denied for table ..." before
  RLS ran. New `0014_api_role_grants.sql` grants `authenticated`
  SELECT/INSERT/UPDATE/DELETE and `service_role` ALL on all public tables
  (RLS remains the row gate; anon gets nothing), plus the one RLS-predicate
  execute that `0013` missed (`app.admin_assigned_ticket`).
- **Webhook RPC (`process_payment_event`, `0011`; mirrored in
  `process_refund_event`, `0013`).** An explicit `::provider_event_status` cast
  was added (a `case` returned `text`), and replay now reports `DUPLICATE`
  in-memory without re-processing (the prior `update ... where
processing_status='RECEIVED'` was a no-op on replay).
- **Test-only.** One `<> any(enum_range(...))` membership check in
  `ledger_and_constraints.sql` was corrected to `<> all(...)`.

No test assertion was weakened; the `security_hardening` denial assertions
(cross-user/unassigned/other-assignee/wrong-capability zero-row, finance/super-
only disputes, audited-RPC-only sensitive reads, service-role-only finalizers)
all pass, proving the API-role grants did not widen the authorization boundary.

## 2026-07-22 — Hardening follow-up, synthetic E2E, validation, readiness review

Backend (Claude Opus 4.8 Max, `0013` + `security_hardening.sql`):

- Dispute queue/assignment/transition/read and all dispute-derived booking/chat/
  evidence access restricted to active **finance/super** only (support removed);
  a stale support assignment on a dispute now grants nothing.
- Audited sensitive reads + storage authorization persist the bounded **reason**
  (with actor/time/target/capability/key) and are exactly-once per key behind a
  transaction advisory lock.
- Explicit execute-grant boundaries: every new public RPC and internal helper
  revokes PUBLIC/anon/authenticated/service_role, then re-grants only intended
  roles; provider finalizers stay service-role-only; RLS-needed predicates keep
  authenticated execute. Tests expanded with support-denial, super-allow-after-
  assign, reason-persistence/replay, advisory-lock, and `has_function_privilege`
  ACL assertions.

Quality (this session):

- Added two deterministic synthetic E2E tests (mobile user journey + Admin
  resolution) over existing repositories; no network/provider I/O.
- Fixed an Admin data-layer defect surfaced by the Admin E2E: `assignCase` moved
  an OPEN ticket into the non-existent `TRIAGED` ticket status (bricking its
  lifecycle); now only reports triage and disputes go under review on assign.
- Corrected `apps/mobile/.env.local` key name to `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  (value untouched; confirmed publishable/client-safe — no service-role secret in
  any public bundle variable).

Validation (non-database, all green): `format`, `lint`, `typecheck:all`,
`test:all` (316 tests: 93 shared + 83 Admin + 140 mobile), `build`,
`admin:build`, `mobile:config-check`, `mobile:export` (38 routes). Database/RLS
execution remains blocked (tasks 3.12/3.13). Added
`docs/acceptance/production-readiness-review.md` (recommendation: NO-GO).

## 2026-07-22 — Backend security hardening (migration 0013)

Added `supabase/migrations/0013_security_hardening.sql` (additive, non-destructive
— replaces policies/functions only, drops no schema or data) and
`supabase/tests/security_hardening.sql`.

Changed:

- Sensitive chat, exact location, ID documents, case/dispute/ticket narrative,
  ticket messages, evidence, and their storage objects are now visible only to
  the owner/participants and the ONE Admin explicitly assigned to the relevant
  report/dispute/ticket/verification case. Broad `app.is_admin()` /
  unqualified-capability fallbacks were removed from these surfaces. Super-admin
  is no longer an implicit purpose assignment for sensitive content.
- New assignment-scoped, active-account, unrevoked-capability helper functions
  (`app.has_active_capability`, `app.admin_assigned_*`, `app.safe_uuid`,
  `app.storage_seg`) with fixed `search_path` and no caller-controlled bypass.
- Storage read policies now bind objects to real table rows (verification
  document, message media, task media, portfolio item, evidence) instead of
  trusting a guessed path; malformed paths parse to NULL and match nothing. The
  chat-media read path is corrected so the second participant can read (it
  previously could not) while unassigned Admins cannot.
- Capability-scoped queue metadata views (`admin_report_queue`,
  `admin_dispute_queue`, `admin_ticket_queue`, `admin_verification_queue`)
  expose only non-narrative columns so queues stay triageable without leaking
  content.
- Finance: `admin_refund` no longer authoritatively refunds — it records a
  REQUESTED refund and posts NO ledger movement / NO booking change, guards
  against refunding already-released/withdrawn funds, and fails closed. A new
  service-role `process_refund_event` finalizes refunds idempotently and
  fee-correctly only on a provider-authoritative event. `request_withdrawal`
  takes a per-user advisory lock and an active-account check to prevent
  concurrent over-reservation. New service-role `process_payout_result`
  performs exactly-once reserve reversal on payout failure. Raw finance/ledger
  reads now require an ACTIVE finance/super Admin.

Not executed: the SQL requires Supabase-local/Docker (absent here); tests are
authored and static-reviewed but not run against a live Postgres (task 3.12).

## 2026-07-21 — Foundation + backend

Added:

- npm-workspace monorepo, strict shared TypeScript, ESLint (bans `any`),
  Prettier, Vitest, and CI (format/lint/typecheck/test/build + secret-safe +
  migration static checks).
- `@dizkarte/config`: exact 39-key light/dark brand token contract + gradients,
  environment parser, and fail-closed production guard. Unit-tested.
- `@dizkarte/domain`: IDs, statuses, DTOs + privacy assertions, stable errors +
  API envelopes, integer-centavo money, double-entry ledger primitives, state
  machines + actor gates, provider/repository ports, and deterministic synthetic
  adapters (rejected in production). Unit-tested.
- Supabase migrations: extensions/enums, full schema with keys/checks/indexes/
  triggers, public-safe views, one-active-booking constraint, immutable balanced
  ledger, RLS on every table, private storage policies, seed, and transactional
  `SECURITY DEFINER` RPCs for the key privileged workflows.
- Edge Functions: `health` and a signed `payment-webhook` that fails closed in
  production and never fabricates a paid state.
- Docs: architecture, data model, setup, environments, deployment/backup/
  rollback/reconciliation, decision register, risk register, traceability, and
  account/access.

Explicitly not done (owned elsewhere / blocked):

- Mobile and Admin frontend UI/UX (next pass).
- Live payment/map/push/store integrations (release blockers B1–B10).
