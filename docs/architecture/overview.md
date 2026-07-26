# Architecture Overview

Dizkarte is a TypeScript **modular monolith** with explicit integration ports.
One repository, one governed Postgres system of record (Supabase), no
microservices or queues unless a selected provider later requires one.

## Layers

```
Expo mobile / Next.js Admin
        │  (publishable Supabase + restricted map/push identifiers)
        ▼
Supabase Auth ─▶ PostgREST / RPC / Storage / Realtime  (RLS-enforced)
        │
        ├─ SECURITY DEFINER functions for privileged, transactional commands
        │
        └─ Edge Functions (service-role) for signed webhooks / health
                 ▲
        Payment provider (signed webhook → provider_events inbox → idempotent
                          booking/ledger transaction → committed notifications)
```

Service-role and provider secrets exist only in managed server environments.

## Packages

### `@dizkarte/config`

- Exact 39-key semantic light/dark theme contract + approved gradients.
- Environment parser (`development | test | staging | production`) and explicit
  adapter modes (`synthetic | sandbox | live`).
- Fail-closed production guard: rejects synthetic adapters and missing
  credentials in staging/production, and rejects any secret leaked into public
  config.
- Non-secret technical safeguards (pagination bounds, text/media/money limits).

### `@dizkarte/domain`

- Branded IDs, status unions, stable error codes, typed API envelopes.
- Zod input schemas for every user-controlled command.
- Integer-centavo PHP money helpers (floats/foreign currency rejected).
- State-transition maps + actor gates for verification, tasks, offers, bookings,
  payments, completion, reviews, disputes, and withdrawals.
- Double-entry ledger primitives (balanced-to-zero validation).
- Public-safe DTO projections with runtime privacy assertions.
- Ports: `PaymentProvider`, `MapProvider`, `PushProvider`, `MediaSigner`,
  `Clock`, `IdGenerator`, `MarketplaceRepository`.
- Deterministic synthetic adapters that carry `synthetic: true` and refuse to
  run in production.
- No React/Next/RN/Supabase-service-role/provider-SDK imports.

## Database

- Auth identity in `auth.users`; application tables use UUID keys + UTC times.
- RLS on every user-facing table; Admin-sensitive operations use reviewed
  `SECURITY DEFINER` functions with capability checks, not blanket service-role.
- Storage buckets/paths are policy-partitioned by owner/participant.
- Material state changes and finance are transactional, idempotent, and append
  history/audit records.

## Core invariants (enforced at the database/server boundary)

1. Authentication never substitutes for row/action authorization.
2. Exact location/contact/chat is gated until authoritative confirmed payment.
3. A task has at most one active payment-pending/confirmed booking
   (partial unique index `uq_booking_active_per_task`).
4. Clients cannot self-confirm payment; Taskers cannot release funds.
5. Balances derive from a balanced, append-only ledger.
6. Provider events and privileged commands are idempotent (unique keys +
   `provider_events` replay protection).
7. Verification, approval, role, moderation, payment, review reveal, and Admin
   actions are server-controlled and audited.
8. Private storage requires authorized, short-lived access.
9. Synthetic adapters cannot run in production.
10. Tests/logs never use real IDs, payment details, exact addresses, or tokens.
