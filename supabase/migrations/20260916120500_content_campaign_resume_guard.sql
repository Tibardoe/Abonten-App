-- Spotlight promotions: close two gaps in content_campaign_transition found
-- while documenting the admin flow.
--
-- 1. An advertiser could resume a promotion that staff or the system had
--    paused (the apps hid the button, but POST /api/mobile/content/
--    campaigns/<id> {action: "resume"} was accepted). Now an advertiser may
--    only lift a pause they made themselves.
-- 2. Resuming did not re-check that the campaign is paid and its Spotlight
--    is still published and visible, so a promotion on a hidden post could
--    be resumed and accrue spend. Resume now applies the same check as
--    approval.
--
-- The body is otherwise identical to 20260916120200.

create or replace function public.content_campaign_transition(
  p_campaign_id uuid,
  p_to          text,
  p_actor_id    uuid,
  p_actor_kind  text,
  p_reason      text default null
)
returns public.content_campaign
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.content_campaign%rowtype;
  v_from   text;
  v_allowed boolean;
  v_post_ok boolean;
begin
  if p_actor_kind not in ('advertiser', 'admin', 'system') then
    raise exception 'Bad actor kind' using errcode = '22023';
  end if;

  select * into c from public.content_campaign where id = p_campaign_id for update;
  if not found then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  v_from := c.status;
  if v_from = p_to then
    return c;
  end if;

  -- Who may do what.
  v_allowed := case
    when p_to = 'pending_payment'   then v_from = 'draft' and p_actor_kind in ('advertiser', 'system')
    when p_to = 'draft'             then v_from = 'pending_payment' and p_actor_kind = 'system'
    when p_to = 'payment_confirmed' then v_from in ('pending_payment', 'draft') and p_actor_kind = 'system'
    when p_to = 'pending_review'    then v_from = 'payment_confirmed' and p_actor_kind = 'system'
    when p_to = 'scheduled'         then v_from = 'pending_review' and p_actor_kind = 'admin'
    when p_to = 'active'            then (v_from = 'pending_review' and p_actor_kind = 'admin')
                                       or (v_from = 'scheduled' and p_actor_kind = 'system')
                                       -- An advertiser may only lift their own pause; a pause by
                                       -- staff or the system stays until staff lift it.
                                       or (v_from = 'paused' and p_actor_kind in ('admin', 'system'))
                                       or (v_from = 'paused' and p_actor_kind = 'advertiser' and c.pause_source = 'advertiser')
    when p_to = 'paused'            then v_from = 'active' and p_actor_kind in ('advertiser', 'admin', 'system')
    when p_to = 'completed'         then v_from in ('active', 'paused') and p_actor_kind = 'system'
    when p_to = 'rejected'          then v_from = 'pending_review' and p_actor_kind = 'admin'
    when p_to = 'cancelled'         then (v_from in ('draft', 'pending_payment') and p_actor_kind in ('advertiser', 'admin', 'system'))
                                       or (v_from in ('pending_review', 'scheduled', 'active', 'paused') and p_actor_kind in ('advertiser', 'admin'))
    when p_to = 'refunded'          then v_from in ('rejected', 'cancelled', 'completed') and p_actor_kind in ('admin', 'system')
    else false
  end;
  if not v_allowed then
    raise exception 'Cannot move a % campaign to % as %', v_from, p_to, p_actor_kind using errcode = '22023';
  end if;

  if p_to in ('rejected', 'cancelled', 'paused') and p_actor_kind = 'admin'
     and (p_reason is null or length(trim(p_reason)) < 3) then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  -- Going live needs a verified payment and a visible post.
  if p_to in ('scheduled', 'active') and v_from in ('pending_review', 'scheduled', 'paused') then
    if c.paid_minor <= 0 or c.transaction_id is null then
      raise exception 'Campaign is not paid' using errcode = '22023';
    end if;
    select p.status = 'published' and p.moderation_state = 'visible' into v_post_ok
    from public.content_post p where p.id = c.post_id;
    if not coalesce(v_post_ok, false) then
      raise exception 'The Spotlight is not live' using errcode = '22023';
    end if;
  end if;

  -- Approving after the chosen start has passed: start now, keep the
  -- duration.
  if p_to = 'active' and v_from = 'pending_review' then
    if c.starts_at > now() then
      -- Not yet due: the admin asked for "active" but it is a schedule.
      p_to := 'scheduled';
    else
      c.starts_at := now();
      c.ends_at := now() + make_interval(days => c.duration_days);
    end if;
  elsif p_to = 'scheduled' and v_from = 'pending_review' and c.starts_at <= now() then
    c.starts_at := now();
    c.ends_at := now() + make_interval(days => c.duration_days);
    p_to := 'active';
  end if;

  update public.content_campaign
  set status          = p_to,
      starts_at       = c.starts_at,
      ends_at         = c.ends_at,
      reviewed_by     = case when p_actor_kind = 'admin' and v_from = 'pending_review' then p_actor_id else reviewed_by end,
      reviewed_at     = case when p_actor_kind = 'admin' and v_from = 'pending_review' then now() else reviewed_at end,
      review_reason   = case when p_to = 'rejected' then p_reason else review_reason end,
      pause_reason    = case when p_to = 'paused' then p_reason when p_to = 'active' then null else pause_reason end,
      pause_source    = case when p_to = 'paused' then p_actor_kind when p_to = 'active' then null else pause_source end,
      activated_at    = case when p_to = 'active' and activated_at is null then now() else activated_at end,
      last_accrued_at = case when p_to = 'active' then now() when p_to = 'paused' then null else last_accrued_at end,
      completed_at    = case when p_to = 'completed' then now() else completed_at end,
      cancelled_at    = case when p_to = 'cancelled' then now() else cancelled_at end,
      updated_at      = now(),
      version         = version + 1
  where id = p_campaign_id
  returning * into c;

  insert into public.content_campaign_event (campaign_id, actor_id, actor_kind, from_status, to_status, reason)
  values (p_campaign_id, p_actor_id, p_actor_kind, v_from, p_to, p_reason);

  return c;
end;
$$;

revoke all on function public.content_campaign_transition(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.content_campaign_transition(uuid, text, uuid, text, text) to service_role;
