# Dizkarte Admin

Protected Admin web console (Next.js App Router) for the Dizkarte task
marketplace. See `.kiro/specs/dizkarte-platform/tasks.md` section 4 for the
requirement-by-requirement status.

## Run locally

```bash
cp .env.example .env.local
npm install   # from the repo root
npm run dev --workspace apps/admin
```

The console reads and writes the real Supabase project, so sign in with a real
account that holds an Admin capability. In development the login page lists the
seeded test accounts created by `npm run seed:supabase` from the repo root.

## Scripts (run from this directory or via `npm run admin:<script>` at the root)

```bash
npm run dev          # local dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
```

## Authentication

Real Supabase Auth throughout — there is no synthetic or hardcoded admin
directory.

- `POST` sign in: `src/app/login` → `loginWithSupabase()`. A credential that is
  valid but holds no active Admin capability is signed out again and rejected
  with a generic message, so the console never discloses account existence.
- Password recovery: `/reset-password` sends the email, `/auth/confirm` exchanges
  the emailed one-time `token_hash` for a short-lived session (a route handler,
  because only handlers and Server Actions may write auth cookies), then
  `/update-password` sets the new password and re-verifies Admin capability
  before accepting it.
- Sessions live in httpOnly cookies managed and refreshed by `@supabase/ssr`.

For password recovery to work end to end, the deployment origin must be
allow-listed under Supabase → Authentication → URL Configuration. Set
`ADMIN_SITE_URL` when the app runs behind a proxy whose forwarded headers should
not be trusted; otherwise the origin is derived from the request.

## Authorization

- `src/lib/session.ts` holds the real server-side boundary. `requireAdminSession()`
  verifies the user through Supabase and reads capabilities from
  `user_capabilities`; it is called independently by every protected layout,
  page, server action, and route handler.
- `src/middleware.ts` performs a convenience redirect only. It is not the
  boundary — a bypassed or misconfigured middleware cannot grant access.
- `src/lib/guard.ts` (`requirePageCapability`) is the page-level wrapper. It
  makes the same decision, then turns a refusal into navigation: unauthenticated
  goes to `/login`, an authenticated Admin without the required grant goes to
  `/access-restricted`. Server actions keep throwing rather than navigating.
- Capability gates: `ADMIN_SUPPORT` for verification/taskers/users/tasks/reports/
  support, `ADMIN_FINANCE` for payments/reconciliation/withdrawals/disputes,
  `ADMIN_SUPER` for categories/audit/settings. `ADMIN_SUPER` satisfies any gate.

## Data layer

`src/lib/repository/` is a narrow `AdminRepository` port with two adapters:

- `supabase-admin-repository.ts` (default, all environments). Reads use the
  signed-in Admin's own JWT with the publishable anon key, so RLS is always the
  row gate; the service-role key is never used here. Triage lists come from
  capability-scoped tables and the `admin_*_queue` views. Sensitive detail (case
  narrative, evidence, ID documents) is not readable from any base table and goes
  through the audited `admin_read_*` RPCs, which require the caller to be the
  assigned Admin. Every mutation calls a privileged SECURITY DEFINER RPC that
  re-checks capability, requires a bounded reason plus idempotency key, and
  records an immutable audit trail — nothing writes a base table directly.
- `synthetic-admin-repository.ts` (opt-in only). Deterministic in-memory
  fixtures for offline development and tests. Requires
  `ADMIN_DATA_ADAPTER=synthetic` and is rejected outside development/test, so
  staging and production can never be served fabricated data.

Reconciliation has no table in the schema: it is derived on every read from the
payment, provider-event, and ledger rows, so classifications cannot drift.

## Deliberate omissions

These are honest limits of the current backend surface, not stubs:

- User email shows `(not exposed)` — email lives in `auth.users`, which is not
  readable with the anon key.
- Report reporter shows `(protected)` — reporter identity is part of the audited
  narrative surface, not queue metadata.
- Refund, release, and payout approval are visible but disabled and return
  `PROVIDER_UNAVAILABLE` before any mutation: settlement is provider-authoritative
  and no payment/payout provider or refund policy is approved yet.
- ID document bytes are never rendered inline. Object access requires
  `admin_authorize_object_read` plus a short-lived service-role signed URL.

## Styling

- `src/styles/globals.css` consumes the exact `@dizkarte/config` semantic token
  contract via CSS custom properties (`--dk-*`). No hard-coded brand hex values
  in product code.
- Light UI only; there is no user-facing dark-mode switch.
- Icons are real inline SVGs (`src/components/shell/icons.tsx`). No emoji.
