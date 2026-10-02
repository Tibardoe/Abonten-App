---
title: Search in the reader's language
purpose: Explain how search treats letters, date words and everyday words so that a person finds a listing whether they type in English, French, Spanish, German or Portuguese, with or without accents, and how to add a word or a language.
audience: Engineering, operations staff who tune search, translators
scope: public._search_fold and its TypeScript mirror, the folded search documents and columns, search_date_term and _search_temporal, stop words, the search_concept vocabulary in five languages, the typo fallback of a dated search, and the other places typed text is compared (the older search functions, the inbox search, admin filters, the field team's duplicate check, pickers in the apps). Not covered - ranking weights and the recommendation engine (discovery-search-and-recommendations.md) and the admin procedure for tuning the vocabulary (admin/discovery.md).
status: Approved
version: 1.0
lastReviewed: 2026-10-02
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Search in the reader's language

Migration: `supabase/migrations/20261002140000_search_reads_every_language.sql`. Signatures and grants of the public search functions did not change, so app versions already installed keep working.

## 1. What was wrong

The apps have spoken French, Spanish, German and Portuguese since 2026-10-02 ([internationalisation.md](internationalisation.md)). Search still read English only, and letter for letter:

| A person typed | What happened |
|---|---|
| "cafe" | Did not find "Café Kwae". An accent in the title or in the query had to match exactly. |
| "odehyee" | Did not find "Ɔdehyeɛ". Twi, Ewe and Ga letters are not on most keyboards. |
| "demain", "ce week-end", "im Dezember" | Looked up as words in listings. Dates were read in English only. |
| "plage", "iglesia", "Konzert" | Found nothing where listings are written in English. |
| "afrobeats december" | Also showed an "Afrobeats Summer Jam" held in June when fewer than five results matched. |
| "afrobets december" | Found nothing in December. A typo was not forgiven once the search named a date. |

## 2. The same letters

One rule decides when two pieces of text are "the same letters". It is `public._search_fold(text)` in the database and `foldSearchText` in `packages/core/src/search/foldSearchText.ts`. The integration suite checks that the two give the same answer.

| Step | Example |
|---|---|
| Lower case | "SOIRÉE" becomes "soirée" |
| Accents removed | é, è, ê, ë become e; ü becomes u; ç becomes c; ñ becomes n |
| Letters that are really two | ß becomes ss, œ becomes oe, æ becomes ae |
| Letters with no accent form, as people type them | ɔ becomes o, ɛ becomes e, ŋ becomes n, ɖ becomes d, ƒ becomes f, ʋ becomes v, ɣ becomes g (Twi, Ewe, Ga); ƙ, ɓ, ɗ, ƴ become k, b, d, y (Hausa, Fula); ø becomes o, ł becomes l |
| Plain quotes and dashes | ’ becomes ', “ becomes ", – becomes - |

Digits, signs and other scripts are left alone: "gob3" stays "gob3", and Greek or Cyrillic text only loses its accents.

It uses built-in Postgres functions only (`lower`, `normalize`, `regexp_replace`, `replace`, `translate`). There is no extension, so the answer is the same on Postgres 15 (production) and 17 (local), and the last block of the migration fails the deploy if a database folds differently.

Where folding is applied:

- **The search documents.** `search_tsv` on `event`, `place`, `user_info`, `place_service` and `content_post` is generated from folded text.
- **Titles and names.** `event.search_title`, `place.search_name` and `user_info.search_name` are stored generated columns holding the folded title or name. The exact-match, starts-with and trigram comparisons read them, with trigram indexes `idx_event_search_title_trgm`, `idx_place_search_name_trgm` and `idx_user_info_search_name_trgm`.
- **The query.** `_search_normalize` folds it, so every search function compares folded with folded. `normalizeSearchQuery` in `packages/core/src/search/parseSearchQuery.ts` does the same in the apps.
- **The vocabulary.** A trigger folds a term and its words when they are saved (§4).

**Rules for new code:**

- Compare typed text with a title or a name through the folded column (`search_title`, `search_name`). Do not write `ilike` on a raw title or name.
- Never call `_search_fold` on a column for every row of a scan. One call is a few microseconds; a hundred thousand are seconds. Fold when the row is written (a stored column) or once per search (the query). Folding every event's description took the older events search from 0.33 s to 3 s on the 100,000-event catalogue before it was changed to read the search document.

A hashtag is stored as it was written ("#fête"). Spotlight search compares it folded, so "#fete" finds it.

## 3. Dates in a query

`_search_temporal` reads the first date expression of a query and returns the other words, a date window and the date words it read. The words are rows in `search_date_term`, not code.

| Kind | Window | English | French | Spanish | German | Portuguese |
|---|---|---|---|---|---|---|
| today, tonight | now until midnight | today, tonight | aujourd'hui, ce soir, cette nuit | hoy, esta noche | heute, heute abend, heute nacht | hoje, hoje à noite, esta noite |
| tomorrow | all of tomorrow | tomorrow | demain | mañana | morgen | amanhã |
| weekend | Friday 17:00 to Monday 00:00 | weekend, weekends, week end | week-end, weekend, fin de semaine | fin de semana, finde | wochenende | fim de semana |
| month | that month, this year or next if it has passed | january … december and their short forms | janvier … décembre | enero … diciembre | januar … dezember | janeiro … dezembro |

How a query is read:

1. Each word is folded and its punctuation becomes spaces, so "week-end" and "aujourd'hui" match "week end" and "aujourd hui".
2. Phrases of up to three words are tried at each position, the longest first, so "fin de semana" wins over a word inside it and "heute abend" wins over "heute".
3. The first date found counts. Later date words stay in the query as text.
4. Small words right before the date go with it: "ce week-end", "en diciembre", "im Dezember", "este fim de semana". They are dropped only there. "le petit paris demain" keeps "le".
5. English keeps its older rule: "this", "next", "in", "on", "for" and "during" are dropped anywhere once a date was read.

The window is in the time zone of the place being searched (`market_timezone_at`). A title that says the date word itself is still found outside the window ("December to Remember" in July).

Rows have a `kind`, a `month` for months, a `placement` for the small words (`before` or `anywhere`), a `locale` and an `enabled` switch. A word spelled the same in two languages is one row per language. The table has no client access and is changed with SQL.

## 4. Everyday words in four more languages

`search_concept` already widened an English word to the words listings use ("food" also finds "restaurant" and "chop bar"). It now also holds about 200 everyday French, Spanish, German and Portuguese words with the English words listings use for them:

| Typed | Also finds |
|---|---|
| plage, playa, strand, praia | beach, seaside, shore, coast, resort |
| fête, soirée, fiesta, feier, festa | party, celebration, club, night, dj |
| église, iglesia, kirche, igreja | church, worship, service, gospel, praise, prayer |
| musique, música, musik | music, concert, live music, live band, dj |

**A term has a direction** (`search_concept.two_way`).

- **Two-way** is what every term was and what a term staff add is: the term finds its words and each word finds the term ("beans" finds "gob3"), because listings use the term too.
- **One-way** is what the other-language words are: "plage" finds a beach, but a search for "beach" does not look for "plage". No listing is written in French yet, so that lookup could find nothing, and it is not free. On the 100,000-event catalogue a place search for "restaurant" went from 48 ms to 71 ms when it also looked for seventeen words of other languages ([perf/discovery-2026-09.md](perf/discovery-2026-09.md)).

When listings in a language exist, staff switch its terms to two-way in Admin › Discovery › Search vocabulary ("Listings use this term too"). Then "party" also finds a listing titled "Soirée".

A term and its words are folded when saved (trigger `search_concept_fold`): "Crêpe" is stored as "crepe". Blank words, repeats and the term itself are dropped. The admin form folds the same way before it previews (`normalizeConceptWord`).

Stop words of the four languages ("avec", "pour", "con", "para", "mit", "und", "com" and others) join the English ones in `_search_is_stopword`. As before they only matter in the relaxed tier, which matches any meaningful word when nothing matches every word.

## 5. A typo in a search that names a date

The typo fallback runs only when fewer than five results were found. For a search that names a date it now has two parts:

- **Inside the dates:** the words without the date are compared with titles by trigram similarity. "afrobets december" finds "Afrobeats Night" in December.
- **Outside the dates:** the query as typed is compared with titles that say the date word themselves. "remembr december" finds "December to Remember" in July. A title that only shares another word is no longer brought in.

A search with no date behaves as before.

## 6. Everywhere else a reader types words

| Where | What it compares now |
|---|---|
| Older search (`get_filtered_events`, `get_filtered_places` with a search text; what the apps fall back to when unified search is switched off) | Title, name and slug: "contains", on the folded column. Description, category and type: the search document (every word, the last one as a prefix) instead of "contains" on the raw text. "%" and "_" are characters, not wildcards. |
| Inbox search (`list_conversations`) | The folded conversation title, event title, place name and the other person's name. |
| Spotlight search (`search_spotlight`) | The folded search document for the caption, and for a hashtag its words side by side in the hashtags part of that document, so "#fete" finds "#fête". |
| Field team's duplicate check (`fieldops_find_similar_places`) | The folded name, so "Café Kwae" and "Cafe Kwae" score 1. |
| Admin console lists and global search (events, places, people, content browse) | `search_title` / `search_name` with the folded text. Other columns are unchanged. |
| Category suggestions under the search boxes (web `FilterSearchBar`, app `UnifiedSearch` and the older search tab) | `foldedIncludes` on the English name and on the label in the reader's language. |
| Country pickers | `foldSearchText` (it replaced a local helper). |

## 7. Adding a word or a language

- **A word people type that finds nothing:** Admin › Discovery › Search vocabulary ([admin/discovery.md](../admin/discovery.md)). No deploy.
- **A date word:** insert a row into `search_date_term` in a migration. Write the term folded, with single spaces, at most three words. Leave a word out when its folded form is an ordinary word or a name.
- **A stop word:** add it to `_search_is_stopword`, folded, three letters or more.
- **A letter that should fold:** change `_search_fold` and `foldSearchText` together, then regenerate the search documents (the generated columns are only recomputed when their row is written). Add the letter to both test lists.
- **A language:** date words, stop words and vocabulary rows as above. Nothing else is per language.

## 8. Known limits

- Portuguese "março" is not read as a month. Folded, it is the name Marco.
- Weekday names ("friday", "samedi") are not read as dates in any language. English never had them.
- "mai", "mars", "mayo" and "morgen" are read as dates although they can be other words. The literal match outside the window still finds a title that contains them.
- Small words of one language can stand right before a date word in another ("am tonight" loses "am"). Only the word directly before the date is affected.
- An English word does not reach a listing written in French, Spanish, German or Portuguese through the vocabulary until that language's terms are switched to two-way (§4). The listing is still found by its own words.
- The vocabulary and the date words of the four languages were written during engineering work. No native speaker has read them (decision D3 in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md)). Twi date words and vocabulary are not included.
- Text in the search documents is folded when a row is written. A change to the folding rule needs the columns regenerated.

## 9. Tests and measurements

- Unit: `packages/core/src/search/foldSearchText.test.ts`, `parseSearchQuery.test.ts`, `searchVocabulary.test.ts`.
- Integration (local Supabase stack): `packages/services/src/__integration__/search-languages.integration.test.ts` covers folding against the database, dates in each language, the dated typo fallback, the vocabulary in both directions, stop words, the older search, the inbox search and the duplicate check. `content-platform.integration.test.ts` covers Spotlight search. `search-relevance`, `discovery-search` and `search-vocabulary-admin` still pass unchanged.
- Timings on the 100,000-event catalogue: [perf/discovery-2026-09.md](perf/discovery-2026-09.md), section "Search in the reader's language".
- Postgres 15.8, the production version: the migration, its built-in checks and ten behaviour checks were run in a stand-in container, because the local stack and the preview project run 17.6.
