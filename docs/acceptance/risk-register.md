# Risk Register and Release Blockers

Release blockers are items that cannot be resolved in source code. The
implementation documents them and never silently replaces them with fake
production behavior.

## Release blockers (must be resolved before production acceptance)

| #   | Blocker                                                                | Impact                                                                                                                                                                | Resolution owner |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| B1  | Client-owned Supabase / hosting / domain / monitoring                  | No production system of record                                                                                                                                        | Client           |
| B2  | Approved lawful payment / protected-funds / payout model + provider    | Xendit **sandbox** wired incl. refund + payout **finalizers**, verified end-to-end (2026-08-12); LIVE money movement + fund-custody model still Client+counsel-owned  | Client + counsel |
| B3  | Map/geocoding provider + restricted keys                               | RESOLVED (2026-08-09) — Client Google Cloud key + billing provided; geocoding runs server-side via the `geocode` Edge Function (key held as `GOOGLE_MAPS_SERVER_KEY`) | Client           |
| B4  | Firebase/APNs push credentials + device matrix                         | No live push delivery                                                                                                                                                 | Client           |
| B5  | Apple/Google developer + signing accounts                              | No store deployment                                                                                                                                                   | Client           |
| B6  | Privacy/consent/retention/DSAR/breach policies                         | Legal exposure                                                                                                                                                        | Client + counsel |
| B7  | Cancellation/refund/dispute/chargeback/release/payout/fee/tax policies | Undefined money rules                                                                                                                                                 | Client           |
| B8  | Approved legal/safety/insurance copy                                   | Cannot ship truthful copy                                                                                                                                             | Client + counsel |
| B9  | Numeric device/performance targets + UAT/acceptance protocol           | Cannot certify readiness                                                                                                                                              | Client           |
| B10 | Executed Agreement + exact incorporated SOW/document versions          | Scope authority                                                                                                                                                       | Client           |

## Technical risks and mitigations

| #   | Risk                                         | Mitigation in this pass                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-A | Exact location/contact leakage               | Structural table separation + RLS + public-safe views + runtime DTO assertions + tests                                                                                                                                                                                                                                                                                                                                  |
| R-B | Double booking under concurrency             | Row locks in `select_offer` + partial unique index                                                                                                                                                                                                                                                                                                                                                                      |
| R-C | Webhook replay/reorder                       | `provider_events` unique key + idempotent `process_payment_event`                                                                                                                                                                                                                                                                                                                                                       |
| R-D | Ledger corruption                            | Balanced-to-zero deferred constraint + immutable triggers + tests. Migration `0033`: the balance-check trigger is SECURITY DEFINER with a pinned `search_path`, so the >=2-entries/sum-zero invariant is evaluated over the full transaction and is never weakened by the committing role's RLS visibility (previously a Client-initiated escrow release wrongly failed because RLS hid the Tasker's entries at commit) |
| R-E | Privilege escalation via client role claims  | Capabilities are server-only; RLS uses `app.has_capability`; no client writes to `user_capabilities`                                                                                                                                                                                                                                                                                                                    |
| R-F | Secret leakage into bundles                  | Config guard rejects secrets in public config; CI secret-safe check                                                                                                                                                                                                                                                                                                                                                     |
| R-G | Synthetic behavior mistaken for live         | `synthetic: true` markers; production guard in code, DB, and edge boundary                                                                                                                                                                                                                                                                                                                                              |
| R-H | Over-broad Admin access to sensitive content | Migration `0013`: chat/exact-location/ID/narrative/evidence and their storage objects are assignment-scoped to the explicitly assigned Admin (active account + unrevoked capability); super is not an implicit assignment; queue metadata split into capability-only views; RLS/storage tests in `security_hardening.sql`                                                                                               |
| R-I | Non-provider-authoritative refund/payout     | Migration `0013`: `admin_refund` records intent only and fails closed (no ledger/booking change); `process_refund_event` (service-role) finalizes idempotently and fee-correctly; `process_payout_result` performs exactly-once reserve reversal on failure; already-released funds cannot be reversed                                                                                                                  |

Status: all technical mitigations above are implemented and unit-tested at the
domain/config layer; database-level RLS/concurrency tests require a running
Postgres (Supabase CLI) and are provided as SQL to run in CI/staging.

## Open technical follow-ups (introduced/surfaced by hardening 0013)

- **Assignment write path — RESOLVED in `0013`.** Migration `0013` adds
  idempotent self-assignment RPCs (`admin_assign_report`/`_dispute`/`_ticket`/
  `_verification`) and status-transition RPCs (`admin_transition_report`/
  `_dispute`/`_ticket`), granted to `authenticated`, that let an active,
  correctly-capable Admin set `assignee_id`/`assigned_admin_id` on themselves
  (rejecting caller-chosen assignees and unsafe reassignment) with
  moderation-action + audit records. Disputes are finance/super only. Still
  requires DB execution to validate at runtime (tasks 3.12/3.13).
- **Refund/payout finalization — wired to Xendit + verified (sandbox).**
  `process_refund_event` and `process_payout_result` remain service-role-only and
  fail closed, but are now driven by real provider events: `payment-webhook`
  routes Xendit refund/disbursement callbacks (`?kind=refund|payout`) to them,
  with `payment-refund`/`payment-payout` dispatch functions on the money-out
  side. Verified end-to-end in **sandbox** (refund reversal; payout FAILED
  reversal + COMPLETED settle). LIVE dispatch still requires the approved
  provider model + a Money-out:Write key and recipient-account/KYC handling
  (blocker B2, task 9.1); they never fabricate success.
- **DB execution — DONE.** Migrations `0001`–`0014` and all three SQL suites
  (`ledger_and_constraints` 4/4, `rls_enabled` 3/3, `security_hardening` 30/30)
  now execute cleanly against a real local Supabase/Postgres (pinned Supabase
  CLI + Docker). Tasks 3.12/3.13 are checked. Remaining: a staging run against
  Client-owned infrastructure (blocker B1).
