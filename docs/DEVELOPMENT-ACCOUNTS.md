# Development accounts

The accounts created by `npm run seed:supabase`, what each is for, and how to
sign in.

> **Development only.** These credentials are deliberately well-known so the
> team can sign in without coordination. Never seed a production project, and
> never reuse this password for a real account.

**Shared password for every account: `Password123!`**

Supabase stores it bcrypt-hashed in `auth.users` — the plaintext exists only in
the roster file below, never in the database.

Email addresses use the reserved, non-deliverable `.invalid` TLD, so none of
them can receive mail. Password-reset and email-confirmation flows therefore
cannot be exercised with these accounts; use a real inbox for those.

## Single source of truth

`packages/config/src/dev/dev-accounts.json` holds the roster and the password.
It is read by:

- `scripts/seed-supabase.mjs` — provisions the accounts
- the Admin login page — lists the Admin accounts
- the mobile sign-in screen — lists the mobile accounts and prefills the form

Because all three read the same file, what an app displays can never drift from
what was actually provisioned. Change the password in that one file and re-run
the seeder.

Both apps gate the on-screen list on the resolved environment being
`development` or `test`, so it never renders against staging or production.

## Setup

```bash
cp .env.seed.example .env.seed     # then fill in the two Supabase values
npm run seed:supabase              # idempotent — safe to re-run
```

`.env.seed` needs only your Supabase URL and the service-role key (Project
Settings → API). No password configuration is required.

Re-running the seeder resets every account below to the shared password, so if
you change one in the app the seeder restores it.

## Admin console

Run `npm run dev --workspace apps/admin`, then sign in at `/login`.

| Account | Capability | Can open | Refused |
| --- | --- | --- | --- |
| `super-admin@dev.dizkarte.invalid` | `ADMIN_SUPER` | Everything, including Categories, Audit log, Settings | — |
| `support-admin@dev.dizkarte.invalid` | `ADMIN_SUPPORT` | Verification, Tasker applications, Users, Tasks, Bookings, Reports, Support tickets | Finance and governance sections |
| `finance-admin@dev.dizkarte.invalid` | `ADMIN_FINANCE` | Payments & ledger, Reconciliation, Withdrawals, Disputes | Trust & safety and governance sections |

A refusal is not an error: an authenticated Admin without the required
capability lands on `/access-restricted`, which names the capabilities the
account actually holds. `ADMIN_SUPER` satisfies every gate.

## Mobile app

Run `npm run start --workspace apps/mobile`. The sign-in screen has a
"Development test accounts" panel — tap an account to prefill the form.

| Account | State | Use it to test |
| --- | --- | --- |
| `client@dev.dizkarte.invalid` | Identity APPROVED. Owns the seeded OPEN tasks. | Posting, editing and publishing tasks; browsing; selecting an offer |
| `tasker@dev.dizkarte.invalid` | Identity APPROVED, Tasker application APPROVED, not suspended. Holds `CLIENT` and `TASKER`. | Submitting and withdrawing offers; Tasker Dashboard; editing the public Tasker profile |
| `tasker-applicant@dev.dizkarte.invalid` | Identity APPROVED, Tasker application `IN_REVIEW`. | The Admin Tasker-applications queue. Cannot submit offers yet — that is correct |
| `new-user@dev.dizkarte.invalid` | `CLIENT` only, no verification case. | Confirming the gates refuse: publishing a task and submitting an offer both fail |

Every account also holds `CLIENT`, because one person can be both a Client and
a Tasker on Dizkarte. Admin capabilities are add-ons, not replacements.

## Notes

- Suspending or banning an account from the Admin console withdraws every
  capability-gated surface immediately but keeps the capability grants, so
  reinstating is lossless. The seeder does not undo a suspension — set the
  account back to active in the console.
- Escrow checkout and payouts are not reachable with any account: no payment or
  payout provider is approved, so bookings deliberately stop at
  `PAYMENT_PENDING` until the payment integration lands.
