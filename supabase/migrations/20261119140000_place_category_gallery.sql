-- A place category for art galleries (and the like). The first gallery the
-- growth desk onboarded (Berj Gallery, Busua, 19 Nov 2026) had to be filed
-- under "Entertainment" because no category fitted.
--
-- Data only. The label is translated in the app from the slug
-- (core messages `placeCategories.gallery`, PLACE_CATEGORY_SLUGS), and the
-- schema.org type is ArtGallery (packages/core/src/seo/jsonLd.ts).

insert into public.place_category (id, name, slug)
values (15, 'Gallery', 'gallery')
on conflict do nothing;

-- Search: "museum" and "exhibition" also find galleries ("art" already
-- expands to gallery). One-way, like every concept until listings are
-- written in more languages (docs/architecture/search-languages.md).
insert into public.search_concept (term, expands_to, applies_to, note)
values
  ('gallery', array['art gallery', 'exhibition', 'art', 'museum'], array['event', 'place', 'spotlight'], 'Place category: Gallery'),
  ('museum', array['gallery', 'exhibition', 'heritage'], array['event', 'place', 'spotlight'], 'Place category: Gallery')
on conflict (term) do nothing;
