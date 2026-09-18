-- Deferred items from the 2026-09-18 audit (docs/audit/04, F7 and F10).
--
-- 1. get_transaction_refundable_amount(uuid) becomes service-role only.
--
--    It is SECURITY DEFINER and reads ticket_checkout / ticket for any
--    transaction id it is given. An earlier migration (20260904130247)
--    revoked EXECUTE from `authenticated`, but the grant was re-issued later
--    and PUBLIC's default EXECUTE was never removed, so any signed-in user
--    could ask for the refundable amount of any transaction whose id they
--    knew. The only callers are server code that has already authorised the
--    refund (@abonten/services issueRefundCore, now on the service-role
--    client) and the admin finance module (service-role client). Nothing in
--    either app calls it directly.
--
-- 2. content_post / content_media / content_comment: one SELECT policy per
--    table instead of two permissive ones.
--
--    Each table had a public policy (`to public`) and an author/owner policy
--    (`to authenticated`). Postgres evaluates every permissive policy that
--    applies and ORs them, so every row read by a signed-in user paid for
--    both. The merged policy is the same OR, written once. It is
--    semantically identical for every role: for `anon`, auth.uid() is null,
--    so the author comparison is null (not true) and only the public
--    condition can admit a row -- exactly what the old `to authenticated`
--    restriction achieved. The author comparison comes first because it is
--    a constant-time column check and short-circuits the function call and
--    EXISTS subquery for a user's own rows.

-- 1 -------------------------------------------------------------------------
revoke execute on function public.get_transaction_refundable_amount(uuid)
  from public, anon, authenticated;
grant execute on function public.get_transaction_refundable_amount(uuid)
  to service_role;

-- 2 -------------------------------------------------------------------------
drop policy if exists content_post_public_select on public.content_post;
drop policy if exists content_post_author_select on public.content_post;
create policy content_post_select on public.content_post
  for select using (
    (select auth.uid()) = author_id
    or public.content_post_is_public(status, moderation_state, kind, published_at, expires_at)
  );

drop policy if exists content_media_public_select on public.content_media;
drop policy if exists content_media_owner_select on public.content_media;
create policy content_media_select on public.content_media
  for select using (
    (select auth.uid()) = owner_id
    or (
      status <> 'deleted' and exists (
        select 1 from public.content_post p
        where p.id = content_media.post_id
          and public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)
      )
    )
  );

drop policy if exists content_comment_public_select on public.content_comment;
drop policy if exists content_comment_author_select on public.content_comment;
create policy content_comment_select on public.content_comment
  for select using (
    (select auth.uid()) = author_id
    or (
      status = 'visible' and moderation_state in ('visible', 'restricted') and exists (
        select 1 from public.content_post p
        where p.id = content_comment.post_id
          and public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)
      )
    )
  );
