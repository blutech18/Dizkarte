# Local Setup

## TypeScript packages (no database required)

```bash
npm install
npm run build       # strict typecheck/build of config + domain
npm test            # unit tests
npm run lint
npm run format
```

## Database (optional; requires Supabase CLI + Docker)

The Supabase CLI is not required to build or test the TypeScript packages. To
run the governed Postgres system of record locally:

```bash
supabase start
supabase db reset             # applies supabase/migrations/*.sql then seed.sql
```

Run the database self-checks against the local database:

```bash
psql "$(supabase status -o json | jq -r '.DB_URL')" \
  -v ON_ERROR_STOP=1 -f supabase/tests/ledger_and_constraints.sql
```

### Migration order

Migrations are plain, ordered SQL and are applied in filename order:

```
0001_extensions_and_types.sql
0002_identity_profiles.sql
0003_taskers.sql
0004_marketplace_tasks.sql
0005_messaging_notifications.sql
0006_finance_ledger.sql
0007_reviews_safety_ops.sql
0008_views_and_functions.sql
0009_rls_policies.sql
0010_storage_policies.sql
0011_privileged_rpcs.sql
```

### Edge Functions

`supabase/functions/health` and `supabase/functions/payment-webhook` run on the
Deno-based Supabase Edge runtime. They are intentionally outside the npm
workspace build. Serve locally with `supabase functions serve`.

The webhook **fails closed** in production without a live provider + secret and
never fabricates a paid state. In development with `PAYMENT_MODE=synthetic` it
verifies a deterministic, clearly non-production signature so the flow is
end-to-end testable.

## Creating synthetic users (development only)

Application tables reference `auth.users`. Seed does not create users. Use the
Supabase Auth admin API (service role, dev only) to create synthetic accounts,
then insert a matching `profiles` row and grant capabilities via
`user_capabilities` (server-side only — clients cannot write that table).
