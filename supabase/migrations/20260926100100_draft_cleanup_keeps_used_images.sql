-- Audit 2026-09-26: expired drafts destroyed live event flyers.
--
-- cleanup_expired_drafts() queued every expired draft's flyer for
-- destruction on Cloudinary. A draft that was published without being
-- deleted (any path that did not pass its draft id) shares its flyer with
-- the live event, so when the draft expired the event's image was deleted.
-- Production: "The Dog" (created 2026-09-05) lost its flyer this way; 13
-- older events lost theirs to the pre-2026-09-04 expiry function.
--
-- Now an expired draft's flyer is queued only when no event, live draft,
-- place, place draft or gallery photo uses it. The queue drain re-checks
-- the same references right before destroying (cloudinaryCleanupCore), so
-- an image that becomes used after it was queued is kept too.

create or replace function public.cleanup_expired_drafts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.draft_asset_cleanup_queue (public_id, resource_type)
  select distinct ed.flyer_public_id, 'image'
  from public.event_drafts ed
  join public.drafts d on d.id = ed.draft_id
  where d.expires_at < now()
    and ed.flyer_public_id is not null
    and not exists (select 1 from public.event e
                    where e.flyer_public_id = ed.flyer_public_id)
    and not exists (select 1 from public.event_drafts o
                    join public.drafts od on od.id = o.draft_id
                    where o.flyer_public_id = ed.flyer_public_id
                      and od.expires_at >= now())
    and not exists (select 1 from public.place p
                    where p.cover_public_id = ed.flyer_public_id)
    and not exists (select 1 from public.place_drafts pd
                    where pd.cover_public_id = ed.flyer_public_id)
    and not exists (select 1 from public.place_photo pp
                    where pp.public_id = ed.flyer_public_id);

  delete from public.drafts where expires_at < now();
end;
$$;

revoke all on function public.cleanup_expired_drafts() from public, anon, authenticated;
grant execute on function public.cleanup_expired_drafts() to service_role;
