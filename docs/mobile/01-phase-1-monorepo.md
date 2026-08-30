# Phase 1 — Monorepo

The single Next.js app is now `apps/web` inside an npm-workspaces + Turborepo monorepo.
**No application code changed** — every `src/` change in this phase is a pure `git mv`.
`tsc --noEmit` and `next build` both pass from the new location.

## New layout

```
/
├── package.json            workspace root (private, name "abonten")
├── package-lock.json        single lockfile for all workspaces
├── turbo.json               task graph: build, typecheck, lint, dev
├── biome.json               root Biome, extends packages/config/biome.base.json
├── lefthook.yml             pre-commit Biome hook, now scoped to apps/web/src/
├── apps/
│   └── web/                 the entire former repo root (src, public, messages,
│                            cache, next.config.ts, tailwind, Docker files, .env.local, …)
│                            package name: "@abonten/web"
├── packages/
│   └── config/              "@abonten/config" — shared tsconfig.base.json + biome.base.json
├── supabase/migrations/     unchanged — still the DB source of truth
└── docs/                    unchanged
```

## What changed, precisely

| Item | Before | After |
|---|---|---|
| App files | repo root | `apps/web/` (via `git mv`) |
| `package.json` name | `client` | `@abonten/web`; new `typecheck` script (`tsc --noEmit`) |
| `@biomejs/biome`, `lefthook` | `apps/web` devDeps | root devDeps (hoisted); `turbo` added |
| `overrides` (`@types/react*`) | app package.json | root package.json (npm only honours root overrides) |
| `apps/web/tsconfig.json` | standalone | `extends "@abonten/config/tsconfig.base.json"`; keeps `plugins:[next]`, `paths:{"@/*"}`, `include`/`exclude` |
| `.gitignore` | root-anchored (`/node_modules`, `/.next/`) | path-agnostic (`node_modules`, `.next/`, `dist`, `.turbo`) |
| `lefthook.yml` | `root: "src/"` | `root: "apps/web/src/"` |
| `.dev-server.log` | tracked (stale) | untracked + gitignored |

## Commands

Run from the repo root:

- `npm run build` / `npm run typecheck` / `npm run dev` — Turborepo, all workspaces
- `npm run web:dev` / `npm run web:build` — just `@abonten/web`
- or `npm run <script> -w @abonten/web`

The web app's own `lint` script (`biome check ./src --fix`) is unchanged and still run
from within `apps/web`; the pre-commit hook invokes Biome scoped to `apps/web/src/` only.

## ⚠️ Deploy-side action required before the next push to `main`

**Vercel**: set the project's **Root Directory** to `apps/web` (Project → Settings → Build &
Deployment → Root Directory). Without this the build runs from the repo root and fails —
there is no Next app there any more. "Include files outside the root directory" can stay on.
Everything else (env vars, `output` handling via the `VERCEL` env check in `next.config.ts`)
is unchanged.

**Docker** (secondary, not the primary deploy): `apps/web/Dockerfile` and the
`compose*.yml` files moved with the app and still assume the build context is the app
directory. Building them now needs `docker build apps/web` (context = `apps/web`), or the
compose files adjusted. Not fixed in this phase — flagged for whenever the Docker path is
next used.

## Verification

- `npx turbo run typecheck build` → both tasks successful.
- `next build` output: all routes and `ƒ Proxy (Middleware)` present; the static/dynamic
  split is unchanged (`/events`, `/explore`, `/around-you`, `/plans` still `○ Static`).
- No `src/` file content changed — `git status` shows those as renames only.
