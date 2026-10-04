---
title: Languages - how Abonten is translated
purpose: Explain how every word, number, date and amount reaches a person in the language they chose, on the website, in the app, in emails and in notifications, and which checks keep it that way.
audience: Engineering, anyone adding a screen, a message or a language
scope: The shared catalogs (packages/i18n), how the web app, the native app and the server pick a language and word their text, number and date formatting, the checks in `npm run check:i18n`, and the known limits. Also the help centre's translated pages and the English-only legal pages (§9). Not covered - the admin console (English only).
status: Approved
version: 1.4
lastReviewed: 2026-10-04
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Languages - how Abonten is translated

Abonten can be read in six languages: English, French, Spanish, German, Portuguese and Twi (Akan). The first five are complete. Twi is partly translated and says so in both language pickers (`packages/i18n/src/locales.json`, `partial`).

The rule the whole design follows: **a code decides, a word is shown.** Nothing in the logic may depend on a translated word, and nothing a person reads may be an English word built in code.

## 1. Where the words live

All text is in `packages/i18n/messages/<language>/<namespace>.json`: 35 files per language (for example `events.json`, `checkout.json`, `common.json`). English is the source; the other languages follow it key for key.

| Namespace | Used by |
| --- | --- |
| Screen namespaces (`events`, `places`, `settings`, …) | The website and the app |
| `core` | Shared copy in `@abonten/core` (status names, categories, ticket tiers, payment method names). A helper there takes a translator; it never holds English. |
| `server` | Messages the services and the database answer with. Server only. |
| `emails` | The emails. Server only. |
| `validation` | The sentences the shared form rules (`@abonten/validation`) write. |
| `fatal` | The three sentences of the website's last-resort error screen, which renders without any provider. |

The message format is ICU (the format `next-intl` and `use-intl` read). Three habits matter:

- **One message per sentence.** A sentence is never glued together from pieces in code, because word order differs by language. Plurals and choices live inside the message: `{count, plural, one {# ticket} other {# tickets}}`.
- **Bold or linked words** are marked in the message (`<b>…</b>`) and rendered with `t.rich`, on the website and in the app.
- **Numbers go in as numbers.** The message formats them, so "1 billet" and "2 billets" are both right.

## 2. Which language a person gets

| Surface | How the language is chosen | Source |
| --- | --- | --- |
| Website | The `NEXT_LOCALE` cookie, else the browser's `Accept-Language`, else English. The address never carries a language: the proxy rewrites `/events/x` to `/fr/events/x` internally, so every page is rendered on the server in that language. | `apps/web/src/i18n/routing.ts`, `apps/web/src/proxy.ts` |
| Native app | The choice saved on the device (Settings › Language), else the device's language when there is a catalog for it, else English. The splash is held until the saved choice has been read. | `packages/ui-native/src/i18n/I18nProvider.tsx` |
| Server Actions | The request's language, bound once for the whole call. | `apps/web/src/i18n/withActionLocale.ts` |
| Mobile API (`/api/mobile/**`) | The `x-abonten-locale` header the app sends, else `Accept-Language`. | `packages/services/src/i18n/requestLocale.ts` |
| Emails, push and in-app notices | The language saved on the **recipient's** account (`user_info.locale`), never the sender's. Saved when the person picks a language and at sign-in. | `packages/services/src/i18n/userLocale.ts` |

A service keeps its `(supabase, userId, input)` shape and never takes a language argument. The transport binds the language at its entry point and the service reads it back through `AsyncLocalStorage` (`tr()` for the `server` catalog, `coreT()` for `core`). Code that words something for someone else uses `trFor(locale)` / `coreTFor(locale)` with `userLocale(recipientId)`.

## 3. Text the server and the database write

- **Service messages** are worded with `tr("key")` in the language of the request.
- **Messages raised in SQL** (`RAISE EXCEPTION '…'`) stay English in the database. `scripts/i18n/extract-sql-messages.mjs` collects them from the migrations into the `server` catalog, and a response is translated at its edge (`localizeEnvelope`, `translateServerText` in `packages/i18n/src/server.ts`). A raw database error never reaches a person: it goes through `userFacingError`.
- **Form rule messages** are matched back to their catalog key where they are shown (`packages/i18n/src/validation.ts`; `useValidationText()` on the website and in the app).
- **Notifications** are a template plus values (`data.notice = { id, params }`, one registry in `@abonten/core`). The row and its push are worded for the recipient when written, and worded again for whoever opens the inbox, so an inbox follows a change of language. Rows the database writes, and rows from before this design, are read back from their English text into the same templates.
- **Names of things in configuration** (a payment method, a ticket tier, a status) are codes; the service or the screen gives them a name in the reader's language (`paymentMethodLabel`, `ticketTypeLabel`, the status registry).

What stays English on purpose is listed, with the reason for each, in `scripts/i18n/literal-allowlist.json`: answers to webhooks, reasons stored for staff, configuration problems, the brand sign-off.

## 4. Numbers, dates and money

`value.toLocaleString()` formats in the device's or the server's language, not the app's, and `value.toFixed(1)` always writes the English "4.5". Every number a person reads goes through `@abonten/core/i18n/format` (or `formatMoney`) with the app's language:

| Function | Example (English / French) |
| --- | --- |
| `formatCount` | 1,234 / 1 234 |
| `formatPercent` | 7.5% / 7,5 % |
| `formatRating`, `formatDecimal` | 4.5 / 4,5 |
| `formatCompactCount` | 1.2K / 1,2 k |
| `formatFileSize` | 2.3 MB / 2,3 Mo |
| `formatDate`, `formatDateTime` | 3 Oct 2026 / 3 oct. 2026 |
| `formatMoney` (`@abonten/core/formatMoney`) | GH₵1,500.00 / GH₵1 500,00 |

An event's time is shown on the event's own clock (`event.timezone`), in the reader's language. Twi has no number and date data of its own and follows British English.

## 5. The website sends a page only the words it uses

Handing every catalog to the browser made the home page 374 KB. Now each page gets the messages its own client components read (49 KB for the same page).

`scripts/i18n/gen-route-messages.mjs` reads the code: it follows the imports of every route under `app/[locale]`, crosses into client components, and records the keys each one asks for. A key that is not written out at the call (`t(STATUS_LABEL[status])`, `t(tab.label)`) is followed to where its value comes from (`scripts/i18n/lib/key-strings.mjs`). The result is two generated files in `apps/web/src/i18n/` (`routeMessages.generated.json`, `lazyNamespaces.generated.json`); `--check` in CI fails when they are out of date.

At run time:

- `RootMessages` hands over what the site's header and navigation read.
- Each top-level part of the site has a layout wrapped in `SegmentMessages`, which adds that part's messages.
- A component loaded on demand declares its namespaces with `lazyWithMessages`.
- A safety net: if a component still asks for a message the page did not bring, `MessageLoader` fetches that namespace and renders an empty string meanwhile, never a key. The browser test in `apps/web/e2e/i18n.spec.ts` fails if that happens on the pages it visits.

`node scripts/i18n/gen-route-messages.mjs --why <namespace> [--segment <name>]` explains why a page carries a message.

## 6. The native app

The app uses `use-intl` over the same catalogs (`@abonten/ui-native/i18n`): `useTranslations(namespace)`, `t.rich`, `useFormatter`. Three things are particular to it:

- **The engine lacks parts of Intl.** Hermes has number and date formatting and nothing else the translations use: no plural rules, no relative time, no `Intl.Locale`. Without them every plural message printed its key and "5 minutes ago" stayed English. `packages/ui-native/src/i18n/polyfills.ts` loads the standard FormatJS polyfills first, with data for the five full languages. They are plain JavaScript and travel in an over-the-air update.
- **Two screens render without any provider**: the splash (before the providers mount) and the root error screen (after they are gone). They word themselves with `translatorFor(namespace)`, which reads the catalogs directly. `scripts/check-mobile-boot.mjs` keeps provider hooks out of both files.
- **A message that is missing or cannot be formatted** shows its key path and keeps rendering. It is reported once per message: a warning in the developer console, and an event in both error pipelines (`setIntlErrorReporter` in `apps/mobile/app/_layout.tsx`).

- **A tab label is never cut.** `SegmentedTabs` (`packages/ui-native/src/primitives/SegmentedTabs.tsx`) keeps equal columns while every label fits one. When a label does not ("Organisateurs", "Remboursements", "Veranstaltungen"), each tab takes the width of its own label, and the row scrolls sideways if the labels together are wider than the screen. English fits four equal columns; French and German do not.

Code outside React (a helper that words a toast) uses `translatorFor` on both platforms.

## 7. The checks

`npm run check:i18n` runs all of them; CI runs it on every push.

| Check | What it refuses |
| --- | --- |
| `check-i18n.mjs` | A key missing in a language; invalid ICU; a translation whose plural or choice structure differs from the English; a value in a full language that still equals the English (unless recorded in `same-as-english.json`); a translation whose English has changed since it was made (`source-english.json`). |
| `i18n/check-keys.mjs` | A lookup of a key that does not exist, or a message that is not given a value it needs. Keys that arrive through a variable are followed to their value; one that cannot be followed is refused too. |
| `i18n/extract-strings.mjs`, `i18n/check-literals.mjs` | English text in code (web, mobile, server, core, shared). |
| `i18n/extract-sql-messages.mjs`, `i18n/extract-validation-messages.mjs` | A database or form-rule message that is not in the catalog. |
| `i18n/check-code-values.mjs` | A message that prints a stored code as if it were a word. |
| `i18n/check-label-logic.mjs` | A translated label that is compared, indexed, kept as a value, or listed and then used as a key. |
| `i18n/check-formats.mjs` | A number, date, percentage, decimal or amount formatted outside the app's language. |
| `i18n/check-fragments.mjs` | A sentence assembled from several messages. |
| `i18n/gen-route-messages.mjs --check` | Generated page messages out of date, or a part of the site not wired to them. |
| `check-mobile-boot.mjs` (its own script, `npm run check:mobile-boot`) | A provider hook in the splash or the root error screen. |

When the English of a message changes on purpose, re-check its translations and then run `node scripts/check-i18n.mjs --accept-source`. A value that is rightly the same word in another language ("Menu") is recorded with `--accept-same`.

## 8. Adding things

**A message.** Add the key to the English file and to each other language (the checks will name what is missing), then use it with `t("key")`. Do not build the sentence in code.

**A screen.** Use `useTranslations("namespace")`. On the website run `node scripts/i18n/gen-route-messages.mjs` and commit the generated files; a new top-level folder under `app/[locale]/(pages)` needs a layout wrapped in `SegmentMessages`.

**A language.** Add the folder under `packages/i18n/messages`, add it to `locales.json` (in `partial` until it is complete), run `node scripts/i18n/gen-catalog-index.mjs`, and add the FormatJS locale data lines in `packages/ui-native/src/i18n/polyfills.ts`. `node scripts/i18n/translation-units.mjs` exports what is still English for a translator.

**A translator or a reviewer.** `node scripts/i18n/translation-units.mjs export --out <dir> --untranslated ak` gives a translator every sentence a language still shows in English; `--review fr` instead writes the current French beside each English sentence (`<dir>/fr-NN.txt`) for a native speaker to correct in place. `import --locale fr --in <dir>` writes their lines back and refuses any line that loses a placeholder, a select branch or a tag (a language may add plural forms to a number the English prints plainly). Then run `npm run check:i18n`.

## 9. Known limits

- **Twi (Akan) is partly translated.** It needs a native translator; nothing machine-made was added. It is marked in the pickers and exempt from the "nothing left in English" rule.
- **No native speaker has read the French, Spanish, German and Portuguese yet** (`OPERATIONAL_DECISIONS_REQUIRED.md`, D3). They were checked by machine on 2026-10-04 across all 7,640 messages:
  - **Address**: French uses *vous*, Portuguese the European polite forms ("o seu", "para si"), Spanish *tú* and German *du*, each without a single exception.
  - **Terms**: one word per idea ("événement", "billet", "lieu"; "entradas"; "bilhetes", "local"; German "Event", "Ort", and "Location" for a venue).
  - **Shape**: every message has the sentences, questions and length its English has, except where the language is naturally shorter.
  - **Fixed then**: three account error messages that still translated an older, technical English in all four languages; Brazilian forms in the European Portuguese ("Salvar", "Cadastrar-se", "Meus ingressos", "usuário", direct "você"); and 59 API messages that were developer text in every language, English included, now plain sentences that keep the field name.
  - A native reader is still the step that catches wrong tone and unidiomatic phrasing; the review hand-off in §8 is how to commission one.
- **The help centre is in English, French, Spanish, German and Portuguese; the legal pages are English** (`OPERATIONAL_DECISIONS_REQUIRED.md`, D5). A help page's translation sits beside it as `<slug>.<locale>.md` and is served at the English page's address in that language (`apps/web/src/utils/publicContent.ts`); a page with no translation, and every page in Twi, is the English page under a notice, inside an element marked `lang="en"` for screen readers. The legal pages stay English until counsel approves a text and its translation; in another language they say so, and their status and dates are worded and formatted in the reader's language. `npm run check:docs` refuses a translation with no English page, a different `order` or different site links, and warns when the English page changed after it (`help-translations`); it also refuses a translated legal file. When an English help page changes, change its four translations in the same commit.
- **The system's own language choice.** The app declares its languages to iOS and Android (`expo-localization` plugin in `apps/mobile/app.json`; Twi on Android only), so the system settings offer a per-app language, and `deviceLocale()` (`packages/ui-native/src/i18n/I18nProvider.tsx`) reads that choice through `expo-localization` — required lazily, so a binary built without the module falls back to React Native's constants. iOS permission prompts are translated (`apps/mobile/locales/<lang>.json`, written to `InfoPlist.strings` at prebuild); change them with the English texts in `app.json`. Native: reaches users with the next build (Android preview build `ec0e37a8` verified per-app French on 2026-10-04).
- **A deleted account is named, not quoted.** The database scrubs a deleted profile to the English data "Deleted user" and the username `deleted_` + 12 hex digits; screens recognise the username (`isDeletedAccount` / `personName` in `@abonten/core/personName`) and say `core:member.former`. Use `personName` wherever another person's name is shown.
- **A link can name its language.** `?hl=fr` on any page address wins over the cookie and the browser and is remembered as the visitor's choice (`apps/web/src/i18n/routing.ts`, the proxy). The app opens our own pages this way (`inAppLanguage` in `apps/mobile/src/lib/legalLinks.ts`), because the in-app browser sends the phone's language and keeps its own cookies. The same address is what search engines get: a translated public page (event, place, reviews, help, Weekly, location pages) names its canonical in the language it was rendered in (`/help?hl=fr`, plain for English) and lists every language version as an alternate (hreflang en, fr, es, de, pt and x-default; Twi points to English), and the sitemap lists them too (`apps/web/src/i18n/alternates.ts`). The legal pages, English until counsel, list none.
- **The admin console is English only**, by design.
- **Search** reads accents, date words and everyday words in the five complete languages; that is its own document, [search-languages.md](search-languages.md). Its other-language words were not read by a native speaker either (D3), and Twi has none.
- **Content people write** (an event's description, a review) is shown as written.
- **Words checked only on a device.** A translated word used as a lookup key in a way the static check does not model, or a message that fails only in the app's engine, shows up on a phone and nowhere else. Before a release that touches wording, walk the app in a second language (`docs/development/testing.md`, "Walking the app on a device").
