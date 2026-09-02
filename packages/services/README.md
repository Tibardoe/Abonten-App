# @abonten/services

The **single source of business logic** for Abonten. One function per operation,
`(supabase, userId, input) => Promise<{ status, message?, data? }>` — the same
envelope the web Server Actions and the `/api/mobile/**` routes already use.

## Consumed by

- `apps/web/src/actions/**` — the web transport (`"use server"`, resolves the
  user from the SSR cookie session, then calls a service).
- `apps/web/src/app/api/mobile/**` — the mobile transport (`getMobileAuth`
  resolves the user from the `Authorization: Bearer` JWT, then calls the same
  service).

`apps/mobile` **must not** depend on this package. Mobile reaches this logic only
over HTTP through `@abonten/api-client`. Anything mobile does directly against
Supabase (class-A: public reads, RLS-scoped user-owned CRUD) shares only *pure*
helpers from `@abonten/core`, never this package.

## Rules

- **Server-only.** May import `node:*`, `cloudinary`, and talk to Paystack /
  Hubtel. Never imported by a client component — `next build` would bundle
  secret-reading code into the browser.
- **Framework-free.** No `next/*`, no `react` / `react-dom`, no DOM globals.
  A caller that needs a framework primitive (`after()`, `revalidatePath`,
  `cookies()`) keeps that in its own transport layer and passes the result in.
- **No identity derivation.** The caller has already authenticated; a service
  takes the resolved `userId` (or an injected client already scoped to the
  user) and never re-reads a session.
- **Injected Supabase client.** The transport passes the right client
  (cookie-scoped, Bearer-scoped, or — for privileged writes proven safe by an
  upstream identity check — the service-role client from `./supabase`).

## Layout

`src/<domain>/<operation>.ts` — `checkout/`, `payments/`, `tickets/`, `events/`,
`organizer/`, `places/`, `promotions/`, `promo-codes/`, `profile/`,
`notifications/`, `reviews/`, `uploads/`, `platform/`, plus `supabase/` for the
service-role / public client factories.
