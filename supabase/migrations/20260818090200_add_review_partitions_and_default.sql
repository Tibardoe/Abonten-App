-- Pre-existing bug, unrelated to the drafts feature but confirmed blocking
-- it: public.review is RANGE-partitioned on created_at with only 5 monthly
-- partitions (June-October 2025). Any review insert dated outside that
-- window -- including every insert today -- fails with "no partition of
-- relation found for row". Fixed here so review creation (and therefore
-- review-draft submission) actually works, and a DEFAULT partition is added
-- so this class of bug can't recur for any date the specific monthly
-- partitions don't cover.

CREATE TABLE public.review_november_2025 PARTITION OF public.review FOR VALUES FROM ('2025-11-01 00:00:00+00') TO ('2025-12-01 00:00:00+00');
CREATE TABLE public.review_december_2025 PARTITION OF public.review FOR VALUES FROM ('2025-12-01 00:00:00+00') TO ('2026-01-01 00:00:00+00');
CREATE TABLE public.review_january_2026 PARTITION OF public.review FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');
CREATE TABLE public.review_february_2026 PARTITION OF public.review FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');
CREATE TABLE public.review_march_2026 PARTITION OF public.review FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');
CREATE TABLE public.review_april_2026 PARTITION OF public.review FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
CREATE TABLE public.review_may_2026 PARTITION OF public.review FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');
CREATE TABLE public.review_june_2026 PARTITION OF public.review FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE public.review_july_2026 PARTITION OF public.review FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');
CREATE TABLE public.review_august_2026 PARTITION OF public.review FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
CREATE TABLE public.review_september_2026 PARTITION OF public.review FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE public.review_october_2026 PARTITION OF public.review FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE public.review_november_2026 PARTITION OF public.review FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE public.review_december_2026 PARTITION OF public.review FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- Catch-all: any created_at outside every explicit monthly range above
-- (e.g. if a future migration adding next year's partitions is forgotten)
-- lands here instead of failing the insert outright.
CREATE TABLE public.review_default PARTITION OF public.review DEFAULT;

GRANT ALL ON public.review_november_2025 TO anon;
GRANT ALL ON public.review_november_2025 TO authenticated;
GRANT ALL ON public.review_november_2025 TO service_role;

GRANT ALL ON public.review_december_2025 TO anon;
GRANT ALL ON public.review_december_2025 TO authenticated;
GRANT ALL ON public.review_december_2025 TO service_role;

GRANT ALL ON public.review_january_2026 TO anon;
GRANT ALL ON public.review_january_2026 TO authenticated;
GRANT ALL ON public.review_january_2026 TO service_role;

GRANT ALL ON public.review_february_2026 TO anon;
GRANT ALL ON public.review_february_2026 TO authenticated;
GRANT ALL ON public.review_february_2026 TO service_role;

GRANT ALL ON public.review_march_2026 TO anon;
GRANT ALL ON public.review_march_2026 TO authenticated;
GRANT ALL ON public.review_march_2026 TO service_role;

GRANT ALL ON public.review_april_2026 TO anon;
GRANT ALL ON public.review_april_2026 TO authenticated;
GRANT ALL ON public.review_april_2026 TO service_role;

GRANT ALL ON public.review_may_2026 TO anon;
GRANT ALL ON public.review_may_2026 TO authenticated;
GRANT ALL ON public.review_may_2026 TO service_role;

GRANT ALL ON public.review_june_2026 TO anon;
GRANT ALL ON public.review_june_2026 TO authenticated;
GRANT ALL ON public.review_june_2026 TO service_role;

GRANT ALL ON public.review_july_2026 TO anon;
GRANT ALL ON public.review_july_2026 TO authenticated;
GRANT ALL ON public.review_july_2026 TO service_role;

GRANT ALL ON public.review_august_2026 TO anon;
GRANT ALL ON public.review_august_2026 TO authenticated;
GRANT ALL ON public.review_august_2026 TO service_role;

GRANT ALL ON public.review_september_2026 TO anon;
GRANT ALL ON public.review_september_2026 TO authenticated;
GRANT ALL ON public.review_september_2026 TO service_role;

GRANT ALL ON public.review_october_2026 TO anon;
GRANT ALL ON public.review_october_2026 TO authenticated;
GRANT ALL ON public.review_october_2026 TO service_role;

GRANT ALL ON public.review_november_2026 TO anon;
GRANT ALL ON public.review_november_2026 TO authenticated;
GRANT ALL ON public.review_november_2026 TO service_role;

GRANT ALL ON public.review_december_2026 TO anon;
GRANT ALL ON public.review_december_2026 TO authenticated;
GRANT ALL ON public.review_december_2026 TO service_role;

GRANT ALL ON public.review_default TO anon;
GRANT ALL ON public.review_default TO authenticated;
GRANT ALL ON public.review_default TO service_role;
