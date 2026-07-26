# Development accounts

The roster of accounts created by `npm run seed:supabase`, what each one is for,
and how to sign in.

**No passwords are recorded here.** These accounts exist on a real Supabase
project, so a password in source control would be a working credential for
anyone who reads this repository. The password is whatever you set as
`SEED_ACCOUNT_PASSWORD` in the git-ignored `.env.seed` — every account below
shares it, and re-running the seeder resets them all to that value.

Email addresses use the reserved, non-deliverable `.invalid` TLD, so none of
them can receive real mail. Password-reset and email-confirmation flows
therefore cannot be exercised with these accounts; use a real inbox for those.

## Setup

```bash
cp .env.seed.example .env.seed     # then fill in the three values
npm run seed:supabase              # idempotent — safe to re-run
```

`.env.seed` needs your Supabase URL, the service-role key (Project Settings →
API), and `SEED_ACCOUNT_PASSWORD`.

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

Run `npm run start --workspace apps/mobile`.

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
- `DEV-ACCOUNTS.txt` at the repository root is a personal, git-ignored cheat
  sheet. It is optional and never committed.
