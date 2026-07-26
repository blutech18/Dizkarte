# Deployment, Backup, Rollback, and Reconciliation Runbooks

> These runbooks describe procedure. Production execution is blocked until
> Client-owned Supabase/hosting/provider accounts and approved policies exist
> (see `docs/acceptance/risk-register.md`).

## Deployment

1. Apply reviewed forward migrations to staging; run
   `supabase/tests/ledger_and_constraints.sql`; run the RLS role matrix.
2. Deploy the Admin build to preview/staging; capture an immutable build id.
3. Promote to production only after UAT sign-off. Never roll back an applied
   destructive database migration without an approved restoration plan.
4. Mobile: Expo EAS profiles separate development / preview / production.
   Signing remains Client-owned.

## Backup and PITR restore

1. Enable automated backups + Point-in-Time Recovery on the production project.
2. Before any production migration: take a snapshot and record the target
   restore point and the rollback/repair procedure.
3. Restore rehearsal: restore to a scratch project, run the database self-checks,
   and verify a known query set before trusting the restore.

## Rollback

- Application (Admin/mobile) builds roll back independently of the database.
- Forward-only DB migrations: prefer a new corrective migration over reverting.
- Destructive DB changes require the approved restoration plan first.

## Webhook reconciliation

`provider_events` is the source of truth for provider deliveries.

1. Every event is stored with `signature_valid`, `payload_hash`, and a
   `processing_status` of `RECEIVED | PROCESSED | DUPLICATE | QUARANTINED`.
2. Reconciliation job: for each `QUARANTINED` event, compare against the
   provider dashboard using the safe reference/hash; re-drive only after a
   human decision. Never auto-trust a quarantined event.
3. Duplicate/reordered deliveries produce exactly one domain/ledger effect
   because `process_payment_event` keys ledger transactions on the external
   event id and only acts while the booking is still `PAYMENT_PENDING`.

## Provider outage

- `create_payment_session`/webhook paths surface `PROVIDER_UNAVAILABLE` without
  leaking internals. Bookings remain `PAYMENT_PENDING`; no paid state is created.
- On recovery, replaying stored/late events is idempotent.

## Incident escalation

Log structured, secret-free events (event name, safe IDs, actor class,
environment, duration, result). Escalate finance/authorization anomalies to the
finance/super Admin on-call. Never place secrets, raw provider payloads, ID
images, exact addresses, or chat bodies in logs.
