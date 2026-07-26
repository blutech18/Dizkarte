# Data Model and Access Contract

Tables live in `public`; privileged helpers live in schema `app`. Enum types
mirror `@dizkarte/domain` status unions exactly (see
`supabase/migrations/0001_extensions_and_types.sql`).

## Groups

- **Identity** — `profiles`, `user_capabilities`, `verification_cases`,
  `verification_documents`, `verification_events`, `devices`.
- **Taskers** — `tasker_applications`, `tasker_profiles`, `specialties`,
  `tasker_specialties`, `service_areas`, `portfolio_items`, `payout_methods`
  (masked label + reference only; a check constraint rejects raw card numbers).
- **Marketplace** — `categories`, `tasks`, `task_public_locations`,
  `task_private_locations`, `task_media`, `task_questions`, `offers`,
  `offer_events`, `bookings`, `booking_events`.
- **Messaging/Notifications** — `conversations`, `conversation_participants`,
  `messages`, `message_media`, `notifications`, `notification_preferences`.
- **Finance** — `payment_intents`, `provider_events`, `ledger_accounts`,
  `ledger_transactions`, `ledger_entries`, `refunds`, `withdrawals`.
- **Reviews/Safety/Ops** — `reviews`, `review_dimensions`, `reports`,
  `disputes`, `support_tickets`, `ticket_messages`, `evidence`,
  `moderation_actions`, `audit_logs`, `app_settings`.

## Key constraints

| Invariant                           | Mechanism                                                              |
| ----------------------------------- | ---------------------------------------------------------------------- |
| One active booking per task         | partial unique index `uq_booking_active_per_task`                      |
| One offer per tasker per task       | unique `(task_id, tasker_id)`                                          |
| One review per reviewer per booking | unique `(booking_id, reviewer_id)`                                     |
| Ledger balanced to zero             | deferred constraint trigger `assert_transaction_balanced`              |
| Ledger immutable                    | `forbid_mutation` trigger on update/delete                             |
| Idempotent commands                 | unique idempotency keys on bookings/intents/ledger/refunds/withdrawals |
| Replay-safe events                  | unique `(provider, external_event_id)` on `provider_events`            |
| PHP only                            | `currency = 'PHP'` checks + integer-centavo columns                    |

## Public-safe projections

- `public.public_task_feed` — OPEN tasks only, approximate location only. It
  never selects from `task_private_locations`.
- `public.public_tasker_profiles` — trust data only; excludes payout, contact,
  exact address, and Admin notes.
- `public.search_open_tasks(...)` — bounded/indexed feed query; page size capped
  at 100 server-side.

## Ledger sign convention

Money entering the system debits `CLIENT_FUNDING` (negative) and credits
`PROTECTED_HOLD` (positive, tasker-owned) plus `PLATFORM_FEE` when the fee is
non-zero. Release moves `PROTECTED_HOLD → TASKER_AVAILABLE`. Withdrawal reserves
`TASKER_AVAILABLE → PAYOUT_CLEARING`. Every transaction sums to zero. Balances
are derived by `app.derive_user_balances`.
