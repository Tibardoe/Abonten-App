---
title: When something fails - what people see, and how fast pages open
purpose: Describe what the website, the admin console and the app do when a request fails, when the database is unreachable or when the connection drops, and how a page's first requests are kept few, so that new code follows the same rules.
audience: Engineering, operations, anyone reading an incident where "the site showed nothing"
scope: Server Action calls from the browser (web and admin), cached reads (React Query on the web), page lookups (404 against 500), timed rebuilds (sitemap, Weekly), the proxy's session and account checks, the shell bootstrap request, navigation feedback, the offline notice, confirmation dialogs, and the native app's two provider-less screens. Not covered - payments (PROJECT.md §46.3), the native app's offline cache (mobile-offline-media-and-sync.md).
status: Approved
version: 1.0
lastReviewed: 2026-10-02
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# When something fails - what people see, and how fast pages open

One principle runs through this document: **"could not be read" and "there is nothing" are different answers**, and a person must be told which one they got. Before 2026-10-02 the website often said the second when it meant the first.

## 1. A Server Action call that never comes back

A Server Action answers with an envelope, `{ status, message?, data? }`, and never throws; callers read `status`. The call itself can still reject in the browser:

| Cause | What the person is told (`common.actionFailed.*`) |
| --- | --- |
| The browser is offline | "You're offline. Check your connection and try again." |
| The request was lost on the way | "We couldn't reach Abonten. Check your connection and try again." |
| The tab is older than the deployment, so the server no longer knows the action | "Abonten has been updated since you opened this page. Reload the page, then try again." |
| The proxy refused it because the account is restricted | "Your account has been restricted. Contact support if you think this is a mistake." |
| The action crashed | "That didn't go through. Try again in a moment." (and the error is reported) |

Every call from browser code is written `await saveThing(input).catch(actionUnreachable)`. The guard (`apps/web/src/utils/actionUnreachable.ts`) turns the rejection into the envelope the caller already handles, with `status: 0`. Without it a button stayed busy for good, or, inside a transition, React sent the rejection to the error screen and replaced the page along with whatever the person had typed.

The admin console has its own guard (`apps/admin/src/lib/actionUnreachable.ts`). Its message says the one thing that matters for a staff action: whether it can have been applied ("The server did not answer, so this may or may not have gone through. Reload the page and check before trying again.").

`scripts/check-action-calls.mjs` (`npm run check:action-calls`, in CI) fails when a call from browser code has nothing to catch the rejection. A call is safe when it is guarded, inside a `try`, followed by its own `.catch`, or made by React Query (a `queryFn`, a `mutationFn`, the page fetcher of a paginated list).

**The restricted-account refusal.** The framework's browser code drops any refusal that is not exactly `text/plain`, so the JSON body the proxy used to send reached nobody. The proxy now answers `403` with a code as plain text (`@abonten/core/security/actionRefusal`), and the guard words it.

**Writes through React Query.** A mutation that throws and has no `onError` of its own gets one toast from the shared mutation cache (`apps/web/src/providers/ReactQueryProvider.tsx`). Every mutation is told when trying again cannot work (restricted account, stale tab).

## 2. A read that failed is a failed query

A query whose action answered `{ status: 500 }` used to cache that as its data. The components had the right screens ("Couldn't load your payout accounts. Try again") and never showed them; the empty state showed instead, no retry ran, and a failed background refetch replaced a good list with nothing.

`apps/web/src/providers/envelopeQueryClient.ts` changes this for every query at once: each `queryFn`'s answer passes through `answerOrThrow` (`@abonten/core/envelopeFailure`).

- **Transient** (status 0, 408, 429, 500 and above): the read failed. It throws, React Query keeps the last good data and reports `isError`.
- **Anything else** ("sign in", "not found", "not allowed", "invalid") is an answer and stays data.

A `queryFn` that unwraps the envelope itself must call `answerOrThrow(response)` before it does. A server page that passes initial data to a client list passes `undefined`, not `[]`, when its own read failed (wallet, checkout basket, finances overview, payout accounts); the list then loads and reports the failure itself. The payouts page, which has no query, shows `RefreshErrorRetry`.

The native app applies the same rule per query (`apps/mobile/src/lib/envelope.ts`, where a 401 is transient too because the token is being refreshed).

## 3. When the database is unreachable

Measured against the local stack with the data API stopped:

| | Before | After |
| --- | --- | --- |
| Wallet, checkout, finances | Empty state, as if there were nothing | "Couldn't load…" with Try again |
| Time until the page says so | Minutes (skeletons) | About ten seconds |
| An event or place page | 404 "not found" | 500 with the error screen |

What makes the difference:

- **No retry from the browser for a failure the server answered.** The data client (`@supabase/postgrest-js`) already repeats a failed read three times over seven seconds. A browser sends its Server Actions one at a time, so two more rounds for every query on the page multiplied the wait. A request that never reached the server is still retried twice.
- **The header's one request has a deadline per part.** `getShellBootstrap` answers a dozen questions in one call. Each part gets 3.5 seconds, then its fallback, and its name goes on a `degraded` list. The browser uses the fallback at once and asks for that part again 30 seconds later (`apps/web/src/hooks/shellBootstrap.ts`), so a programme that could not be read is not "off" for the five minutes its answer is otherwise kept.
- **The proxy's account-status check makes one attempt** and remembers only an answer, never a failure. It fails open, as before.

## 4. A lookup that failed is a 500, not a 404

`if (!data) notFound()` treats a lookup that failed as "no such row". For as long as the database was unreachable every event and place page answered 404: to a visitor that reads "this event is gone", and to a search engine it is a reason to drop the page.

`rowOrFailure(result, "event")` (`apps/web/src/utils/rowOrFailure.ts`) returns the row, or `null` when there really is none, and throws when the lookup itself failed. It is used in the event and place layouts, pages and review pages. A missing listing is still a real 404.

**Timed rebuilds.** The sitemap (hourly) and the Weekly pages (every minute) are rebuilt on a timer. A read that failed during a rebuild used to be cached as "no events" or "nothing published". They now throw, the rebuild fails, and the last good copy stays up. During the build itself, where there is no earlier copy, the sitemap goes out with the static pages only.

### Event page caching

`apps/web/src/app/[locale]/(pages)/events/[eventCode]/page.tsx` declares `revalidate = 60`, and its comments say the page is cached for a minute. **It is not.** A route with a dynamic segment is only cached when it also exports `generateStaticParams` (the Weekly pages do), and one of the page's reads (`getSimilarEvents`) uses the session cookie. The build lists the page as dynamic: it is rendered for every request.

Turning the cache on is a product decision, not a one-line fix (`OPERATIONAL_DECISIONS_REQUIRED.md`, D7):

- A cached page keeps showing a cancelled, edited, sold-out or hidden event until it is rebuilt.
- With a timed rebuild, the first visitor after a quiet spell is served the old copy, however old it is.
- So every write that changes the page would have to revalidate it: edits, cancellation, ticket sales that change "sold out", reviews, and moderation done from the admin console, which is a separate app and cannot revalidate the website's cache today.

The benefit would be a page served from the edge for the links people share most.

## 5. What the visitor sees while waiting

- **Navigation progress.** Sixty pages have no skeleton of their own (`loading.tsx`), and a click on a slow connection looked ignored. A thin bar at the top of the window (`NavigationProgress`) shows while a page is on its way. It is driven by the framework's own hook (`onRouterTransitionStart` in `apps/web/src/instrumentation-client.ts`), so links, `router.push` and the Back button all count; it stays hidden for navigations faster than 150 ms.
- **Offline.** "You're offline" shows while the browser has no connection (`OfflineNotice`).
- **Errors outside the main layout.** The landing page and the restricted-account notice have an error screen of their own (`app/[locale]/error.tsx`); they used to fall to the bare last-resort one.

## 6. Confirmations

`window.confirm` and `window.alert` are not used. The browser's box cannot name its buttons (deleting an account was confirmed with "OK"), is not translated, and some in-app browsers never show it.

- Website: `const confirm = useConfirm()`, then `await confirm({ title, message, confirmLabel })` (`apps/web/src/providers/ConfirmProvider.tsx`). Messages that only inform are toasts.
- Admin console: `await confirm("Question? What will happen.", { confirmLabel, danger })` (`apps/admin/src/components/ConfirmProvider.tsx`), built on the `<dialog>` element. The part up to the question mark is the heading.

Both keep the open question in a store read with `useSyncExternalStore` (`@abonten/core/valueStore`), not in `useState`. React holds back the state updates made inside a transition until the transition's work is done, so a dialog opened with `useState` from `startTransition(async () => { if (!(await confirm(…))) … })` never appears: it waits for the action that is waiting for its answer.

## 7. How few requests a page opens with

A browser runs Server Actions one at a time, so each one a page sends at load delays the next.

- **One request for the site chrome.** `getShellBootstrap` answers what the header and navigation ask (which programmes are on, unread counts, profile, roles, market) with the session checked once. Each hook takes its part on first load and keeps its own action for later refetches (`@abonten/core/sharedFirstAnswer`). A signed-in Explore page went from 15 actions to 4.
- **The proxy confirms the session only where it decides something by it** (a private section, a Server Action). Elsewhere it reads the cookie and refreshes an expired token. A confirmed session and the account status are remembered for 30 seconds per server instance.
- **Prefetching.** The category chips and the footer's links are not prefetched: they were twenty and eighteen requests per page view.
- **Messages.** A page sends only the words it uses (`internationalisation.md` §5).

## 8. The native app's two provider-less screens

The splash renders before the providers are mounted, and the root error screen renders after they are gone. A hook that reads a provider throws there: in the splash that is a crash on every cold start, in the error screen a crash of the screen that reports crashes. Both use only plain React Native views, constant colours and `translatorFor()`. `scripts/check-mobile-boot.mjs` (`npm run check:mobile-boot`, in CI) keeps it that way.

## 9. Known limits

- The data client's seven seconds of retries apply to every server-side read. During an outage a page takes about that long to say it failed.
- A restricted account that browses a public page gets no notice until it tries to do something; its reads fail quietly.
- A header value that fell back to a default is corrected after 30 seconds, not sooner.
- The admin console's lists are server-rendered and already tell a failed read from an empty one; they do not retry.
