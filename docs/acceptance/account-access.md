# Account and Access Model

## Application capabilities

Capabilities are stored in `public.user_capabilities` and are **server-granted
only**. Clients cannot write this table; there is no insert/update/delete policy
for end users. Capabilities are read via the `SECURITY DEFINER` helpers
`app.current_capabilities()`, `app.has_capability()`, and `app.is_admin()`.

| Capability      | Purpose                                                            |
| --------------- | ------------------------------------------------------------------ |
| `CLIENT`        | Publish/manage tasks, select+pay, confirm completion, review       |
| `TASKER`        | Discover work, submit offers, perform work, withdraw cleared funds |
| `ADMIN_SUPPORT` | Verification/support/moderation queues                             |
| `ADMIN_FINANCE` | Payments, refunds, freezes, payouts, reconciliation                |
| `ADMIN_SUPER`   | All Admin capabilities incl. audit + settings                      |

Least privilege is enforced server-side. Admin routes additionally require an
active, server-verified Admin capability (never client-supplied role data).

## Managed credentials (owned by the Client for production)

| Credential                                   | Where it lives              | Never in                  |
| -------------------------------------------- | --------------------------- | ------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`                  | Edge Functions / server env | client/mobile bundles     |
| `PAYMENT_API_KEY` / `PAYMENT_WEBHOOK_SECRET` | server env                  | client/mobile bundles     |
| `PUSH_CREDENTIALS`                           | server env                  | client/mobile bundles     |
| `MONITORING_DSN`                             | server env                  | client/mobile bundles     |
| Supabase anon key, map public key            | public config               | (restricted, publishable) |

The config guard (`@dizkarte/config`) refuses to parse a public config that
contains any secret key, and CI runs a secret-safe configuration check.

## Storage buckets (all private)

`id-documents`, `task-media`, `portfolios`, `chat-media`, `evidence`. Objects
are owner-partitioned (first path segment = owner user id) and served only via
short-lived signed URLs created by authorized server logic.
