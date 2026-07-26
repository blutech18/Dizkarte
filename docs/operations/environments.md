# Environments and Configuration

Three environments with separate Supabase projects/configuration.

| Concern      | development        | staging / UAT                | production      |
| ------------ | ------------------ | ---------------------------- | --------------- |
| Data         | synthetic, labeled | production-equivalent schema | live            |
| Adapters     | `synthetic`        | provider `sandbox`           | `live` only     |
| Config guard | tolerant           | **fail closed**              | **fail closed** |
| Secrets      | blank/local        | managed                      | managed         |

## Config contract (`@dizkarte/config`)

- `parsePublicConfig(source)` — validates client-safe values, rejects any secret
  key present in a public context, and rejects synthetic adapters in production.
- `parseServerConfig(source)` — validates server values and enforces:
  - synthetic adapters are rejected in staging/production;
  - `live`/`sandbox` adapters require their credentials (fatal even in dev);
  - staging/production require `SUPABASE_SERVICE_ROLE_KEY`.
- `evaluateServerConfig(source)` — non-throwing check for health/readiness.

## Variable reference

Public (client-safe): `DIZKARTE_ENV`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`MAP_PUBLIC_KEY`, and the `*_MODE` adapter selectors.

Server-only secrets (never in client/mobile bundles):
`SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`,
`PAYMENT_WEBHOOK_SECRET`, `PUSH_CREDENTIALS`, `MONITORING_DSN`.

App front-ends use framework-prefixed public vars (`NEXT_PUBLIC_*`,
`EXPO_PUBLIC_*`); map them to the config contract at the app boundary. Never
prefix a secret with `NEXT_PUBLIC_`/`EXPO_PUBLIC_`.

## Provider webhook secrets

Webhook endpoints are environment-specific and rotate their signing secret
through managed configuration. A rotated secret takes effect without code
changes because verification reads `PAYMENT_WEBHOOK_SECRET` at request time.
