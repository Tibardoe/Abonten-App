-- 20260913090000 created idx_place_visit_place_visited on place_visit
-- (place_id, visited_on), which duplicates idx_place_visit_place_day from
-- 20260911104206. The performance advisor flagged it. Both serve the same
-- lookups; drop the newer copy so every visit insert maintains one index.

drop index if exists public.idx_place_visit_place_visited;
