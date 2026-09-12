# Abonten Hub

Abonten Hub is an event and place discovery, ticketing, messaging and rewards platform for Ghana: a web app at **abontenhub.com**, an **Android app** (Expo), and an internal **admin console**, all sharing one backend.

## What is in this repository

| Path | What |
|---|---|
| `apps/web` | Next.js 16 web app — also the backend: Server Actions, the mobile HTTP API (`/api/mobile/**`), the Paystack webhook, notification delivery, observability ingest. Serves the public legal pages (`/legal/*`) and help centre (`/help`) from `apps/web/src/content`. |
| `apps/admin` | Next.js 16 admin console (RBAC, moderation, finance, rewards, field programme, monitoring). |
| `apps/mobile` | Expo SDK 57 / Expo Router Android app (iOS not yet built). |
| `packages/services` | The single source of business logic, framework-free, consumed by web and admin. |
| `packages/core`, `types`, `validation`, `api-client`, `i18n`, `ui-native`, `ui-tokens`, `config` | Shared pure helpers, types, zod schemas, typed mobile client, six-locale messages, RN UI kit, design tokens, tool config. |
| `supabase/migrations` | The database schema, RLS, functions, triggers and cron jobs — the source of truth (204 files). |
| `scripts/` | `check-mobile-api-parity.mjs`, `check-docs.mjs`, local test-database scripts. |
| `docs/` | Internal documentation: handbooks, runbooks, security, privacy, finance, architecture. Start at **[docs/INDEX.md](docs/INDEX.md)**. |

## Quick start

```bash
npm ci
npm run web:dev                   # http://localhost:3000
npm run dev -w @abonten/admin     # admin console
cd apps/mobile && npx expo start  # Android app (run from apps/mobile)
```

Environment files are not committed; see [docs/development/setup.md](docs/development/setup.md) for what each app needs and [docs/security/secrets-and-environment.md](docs/security/secrets-and-environment.md) for the variable names.

## Checks

```bash
npm run typecheck                 # every workspace
npx biome check <paths>           # lint/format (scoped)
npm run check:api-parity          # every /api/mobile route has a typed client method
npm run check:docs                # documentation validation
npm run test:db:up && npm run test:integration && npm run test:db:down   # Supabase integration suite (Docker)
```

Details: [docs/development/testing.md](docs/development/testing.md), [docs/development/ci.md](docs/development/ci.md).

## Documentation

- **Hub:** [docs/INDEX.md](docs/INDEX.md) — by problem, audience and folder.
- **Engineering reference and changelog:** [PROJECT.md](PROJECT.md).
- **Working rules for AI agents:** [CLAUDE.md](CLAUDE.md).
- **Public policies (drafts under review):** served at `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/security`.

## Status of optional programmes

Abonten Rewards runs in shadow mode (no public credit); the field programme is built but switched off; Paystack Transfers are flag-gated off. See the registers in `docs/` for the decisions each one is waiting on.
