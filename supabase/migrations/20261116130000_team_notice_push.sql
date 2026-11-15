-- Team accounts, stage 3 follow-up: a member's copy of a notice written to
-- their team is pushed to their phone, whatever wrote the notice.
--
-- A team cannot sign in, so it has no phone: the push a writer sends to the
-- team's own row (createNotificationCore, the reward engine) reaches nobody.
-- The copies made by trg_notification_fan_out_to_team now queue a push
-- each, through the same delivery queue the app notices use
-- (notification_delivery, source 'app'); notification_delivery_claim still
-- applies each member's own push preferences when it sends. A copy also
-- names the notice it was copied from (data.source_notification_id).

create or replace function public.notification_fan_out_to_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap text;
  v_name text;
  v_username text;
begin
  if not exists (
    select 1 from public.team t
    where t.account_id = new.user_id and t.status = 'active'
  ) then
    return null;
  end if;

  v_cap := public.team_notice_capability(new.type);
  select full_name, username into v_name, v_username
  from public.user_info where id = new.user_id;

  with copies as (
    insert into public.notification
      (user_id, type, title, body, link, data, image_public_id, image_version)
    select m.user_id, new.type, new.title, new.body, new.link,
           new.data || jsonb_build_object(
             'team_id', new.user_id,
             'team_name', coalesce(v_name, v_username),
             'source_notification_id', new.id
           ),
           new.image_public_id, new.image_version
    from public.team_member m
    where m.team_id = new.user_id
      and m.status = 'active'
      and public.team_role_can(m.role, v_cap)
    returning id, user_id, type
  )
  insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
  select c.id, c.user_id, 'push', 'app', c.type = 'event_cancelled'
  from copies c
  on conflict (notification_id, channel) do nothing;

  return null;
end;
$$;

revoke all on function public.notification_fan_out_to_team() from public, anon, authenticated;
