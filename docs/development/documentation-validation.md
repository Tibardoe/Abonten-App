---
title: Documentation validation
purpose: What `npm run check:docs` verifies, how to run it, and how to fix each kind of failure.
audience: Engineers, documentation maintainers
scope: scripts/check-docs.mjs; docs/**, apps/web/src/content/**, footers and mobile link constants
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Documentation validation

`scripts/check-docs.mjs` — Node ≥ 20, no dependencies (same style as `check-mobile-api-parity.mjs`). Runs in CI (`docs` job) and locally:

```bash
npm run check:docs                # offline rules
npm run check:docs -- --external  # also probe external links (network)
```

## Rules

| Rule | Fails when | Fix |
|---|---|---|
| **Required files** | A file in the required list is missing (`docs/INDEX.md`, `README.md`, `DOCUMENTATION_STANDARD.md`, both registers, the audit matrix, the four legal documents, every `docs/*/README.md` for documented folders) | Create it |
| **Metadata** | An internal doc lacks `title`, `purpose`, `audience`, `scope`, `status`, `version`, `lastReviewed`, `technicalOwner`, `businessOwner`, `legalReviewRequired`, `complianceReviewRequired`; a public legal doc lacks `title`, `summary`, `version`, `effectiveDate`, `lastUpdated`, `status`; a help page lacks `title`, `summary`, `order`, `lastUpdated`, `status`; or `status` is not one of Draft / Review required / Approved / Published / Deprecated | Add the key |
| **Internal links** | A relative Markdown link (`.md`, `.md#anchor`, or a folder) does not resolve on disk; a site link (`/legal/...`, `/help/...`) has no matching content file | Fix the path |
| **Code references** | A backticked path that looks like a repo file (`apps/…`, `packages/…`, `scripts/…`, `supabase/…`, `docs/…`, `.github/…`) does not exist | Update the reference (the code moved) or remove it |
| **Placeholders** | `href="#"` in the footers/sidebar components; `abonten.com/` legal URLs; `example.com`, `TODO_URL`, `lorem ipsum` anywhere in docs or content | Replace with the real link |
| **Social links** | Any of the three official URLs is missing from `packages/core/src/brand/socialLinks.ts`, or a different `x.com/`, `instagram.com/`, `tiktok.com/` Abonten URL appears elsewhere | Use the constants |
| **Secrets** | Patterns that look like live credentials (`sk_live_…`, `sk_test_…`, JWT `eyJ…` ≥ 60 chars, `service_role` followed by a key-like token, `AKIA…`, `-----BEGIN … PRIVATE KEY`, `re_[A-Za-z0-9]{20,}`, or `<ENV_NAME>=<value>` for a known env name) | Remove it; rotate it if real |
| **Public/internal separation** | A file under `apps/web/src/content/` contains a repo path, an env-var name from the known list, a `fieldops_`/`credit_`/`admin_` table name, or a permission key like `users.view_pii` | Rewrite in user language |
| **Terminology** | `venue owner` (outside "venue rebate"), `wallet credit`, `Abonten Credits` (plural), `Twitter` used as the current brand in UI copy | Use the standard term |

Warnings (do not fail): documents still `Draft` or `Review required`, `POLICY DECISION REQUIRED` occurrences (counted so the registers can be reconciled), external links skipped without `--external`.

## Output

Lists each failure as `RULE  file:line  message`, then a summary and exit code 1 on any failure. With `--external`, unreachable external links are reported as failures (404/5xx) or warnings (timeouts).

## Exemptions

Historical documents (the numbered mobile phase logs, the audit snapshot, and the four pre-existing architecture deep dives) predate the standard: they are exempt from the metadata, code-reference and terminology rules and are labelled history in INDEX. This page and `docs/DOCUMENTATION_STANDARD.md` quote the forbidden phrases and are exempt from the placeholder and terminology rules.

## Extending

Add a rule as a small function in `scripts/check-docs.mjs`; keep it dependency-free; document it here and in `docs/DOCUMENTATION_STANDARD.md`.
