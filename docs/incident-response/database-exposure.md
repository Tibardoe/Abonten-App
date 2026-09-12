---
title: Runbook — database exposure or suspicious database activity
purpose: Respond to signs that data is readable or writable by parties who should not have it, or that unexpected changes are occurring in the database.
audience: Engineering, founder
scope: Supabase Postgres, Storage buckets, RLS, service role
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Runbook — database exposure or suspicious database activity

Severity S1.

1. **Detect:** `get_advisors(security)` reports a table without RLS or a policy `USING (true)` on a private table; a bucket found public; reconciliation incidents with impossible states; rows changed without matching audit/service logs; a researcher report; Supabase security notice.
2. **Confirm:** reproduce as `anon`/`authenticated` (Supabase SQL editor `set role authenticated; set request.jwt.claims…` or an anon-key request) — **read-only** checks; review `pg_policies` for the table; storage bucket policies; Supabase Auth logs and `query_logs` for anomalous access.
3. **Contain:** if a table is exposed, add the missing policy / enable RLS with a forward migration applied via MCP immediately (do not wait for the branch flow); if a bucket is public, make it private; if a key is suspected, rotate (`leaked-secret.md`); if writes are occurring, revoke the offending grant.
4. **Preserve:** snapshot affected rows (`select … into` a temp table or export), Supabase logs, advisor output, the migration state (`supabase_migrations.schema_migrations`).
5. **Assess:** which data categories and how many rows were readable/writable (`../privacy/data-inventory.md`), and for how long (since which migration or config change — `git log` on the policy files, Supabase dashboard change history).
6. **Escalate:** commander; counsel → breach assessment (`pii-exposure-and-data-breach.md`); Supabase support if platform-side.
7. **Remediate:** correct data through audited RPCs; verify with the integration suite (`authz`, `sec001-*`, `money-path-lockdown`, `fieldops-rbac`) on a local replay; re-run advisors; confirm replay fingerprint equals production.
8. **Communicate:** per breach assessment.
9. **Verify:** advisors clean; the reproduction from step 2 now fails; reconciliation clean.
10. **Document:** incident row; add a register entry in `../audit/01-limitations-register.md` style.
11. **Review:** why the policy gap existed (new table without a policy? migration replay divergence?) and add a test.
