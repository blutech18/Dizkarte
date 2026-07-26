# Dizkarte Mobile

Expo + React Native + Expo Router mobile app for the Dizkarte task
marketplace. See `.kiro/specs/dizkarte-platform/tasks.md` sections 5–8 for the
requirement-by-requirement status.

## Run locally

```bash
cp .env.example .env
npm install   # from the repo root
npm run start --workspace apps/mobile
```

Sign in with one of the deterministic development accounts in
`src/services/synthetic-auth.ts` (never real credentials).

## Scripts (run from this directory or via `npm run mobile:<script>` at the root)

```bash
npm run start          # Expo dev server
npm run typecheck      # tsc --noEmit
npm run test            # vitest run
npm run config-check   # expo config --type public
npm run export         # expo export --platform web (bundle validation)
```

## Architecture notes

- `src/theme/index.ts` maps the exact `@dizkarte/config` light theme; there is
  no dark-mode switch and no invented brand font (system sans stack).
- `src/providers/SessionProvider.tsx` persists a deterministic development
  session via AsyncStorage. Production Supabase Auth wiring is a documented
  release blocker, not present in this pass.
- `src/services/synthetic-*.ts` modules are deterministic, clearly labeled
  development/test data sources; production builds never select them because
  no production entry point imports them and `getAppConfig()` fails closed
  for synthetic adapters outside development/test.
- Reusable accessible primitives live in `src/components/ui/` (`Button`,
  `TextField`, `StatusBadge`, `AsyncState`, `Screen`).

## Known gaps (see tasks.md for the authoritative list)

- No map/nearby view (map provider port is defined in `@dizkarte/domain` but
  not wired into a screen).
- Task edit/preview-before-publish, offer comparison/selection, and the
  payment simulator are not built — only task creation/publish exists on the
  Client side.
- The Tasker Dashboard screen is a visual scaffold with static placeholder
  numbers, not real ledger-derived data.
- Booking chat, completion/dispute flow, and blind bilateral reviews are not
  built.
- Support ticket/report/dispute submission forms are not built — only the
  help/safety hub with an explicit "pending approved copy" notice exists.
