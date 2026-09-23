-- Reviews experience: helpful votes, an "edited" stamp, a rating breakdown
-- and one paged, filterable list for event and place reviews.
--
-- Before this migration the detail screens paged through every review with
-- a plain table read ordered by date, with no way to filter by rating, no
-- breakdown, and no "helpful" signal. Event and place reviews stay in their
-- own tables (event_review / place_review — see 20260823005033 for why they
-- are not one polymorphic table); everything below is written once and
-- takes the subject kind ('event' | 'place') as an argument, so web and
-- mobile share a single read path.
--
-- 1. helpful_count + edited_at on both review tables. helpful_count is a
--    cached counter kept by a trigger on the vote tables — never written by
--    a client (the column guard below refuses it). edited_at is stamped by
--    the database whenever rating/title/comment change, so "Edited" can't be
--    forged or forgotten.
-- 2. event_review_helpful / place_review_helpful: one row per (review,
--    person). The primary key is the one-vote-per-person rule. Clients can
--    read only their own votes and cannot write at all; the only write path
--    is review_set_helpful().
-- 3. review_summary(): average, total and the 1–5 star counts in one
--    aggregate over the existing idx_*_visible_rating indexes.
-- 4. review_list(): keyset-paged list with an optional star filter, "most
--    helpful" or "most recent" order, the viewer's own vote, and reviews by
--    people the viewer blocked left out. SECURITY INVOKER, so RLS still
--    applies on top of the explicit public-visibility predicate.
-- 5. review_set_helpful(): auth.uid()-scoped SECURITY DEFINER write that
--    checks the review is public, the caller isn't its author or the
--    event's organizer / place's owner, neither side blocked the other, and
--    the caller's account isn't restricted.
-- 6. user_block_set(): the account-wide block (conversation_block with a
--    null conversation_id) that messaging, Spotlight and follows already
--    honour, which until now had no user-facing way to be created.
-- 7. Review-photo read policies now follow the review's moderation state.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.event_review
  add column helpful_count integer not null default 0,
  add column edited_at timestamptz;
alter table public.event_review
  add constraint event_review_helpful_count_check check (helpful_count >= 0);

alter table public.place_review
  add column helpful_count integer not null default 0,
  add column edited_at timestamptz;
alter table public.place_review
  add constraint place_review_helpful_count_check check (helpful_count >= 0);

comment on column public.event_review.helpful_count is
  'Cached count of event_review_helpful rows. Trigger-maintained; clients cannot write it.';
comment on column public.event_review.edited_at is
  'Set by the database when rating, title or comment change after posting.';
comment on column public.place_review.helpful_count is
  'Cached count of place_review_helpful rows. Trigger-maintained; clients cannot write it.';
comment on column public.place_review.edited_at is
  'Set by the database when rating, title or comment change after posting.';

-- ---------------------------------------------------------------------------
-- 2. Helpful votes
-- ---------------------------------------------------------------------------
create table public.event_review_helpful (
  review_id  uuid        not null references public.event_review (id) on delete cascade,
  user_id    uuid        not null references public.user_info (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);
create index idx_event_review_helpful_user
  on public.event_review_helpful (user_id, created_at desc);

create table public.place_review_helpful (
  review_id  uuid        not null references public.place_review (id) on delete cascade,
  user_id    uuid        not null references public.user_info (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);
create index idx_place_review_helpful_user
  on public.place_review_helpful (user_id, created_at desc);

comment on table public.event_review_helpful is
  'One "helpful" vote per person per event review. Written only by review_set_helpful(); a person can read their own votes.';
comment on table public.place_review_helpful is
  'One "helpful" vote per person per place review. Written only by review_set_helpful(); a person can read their own votes.';

alter table public.event_review_helpful enable row level security;
alter table public.place_review_helpful enable row level security;

revoke all on table public.event_review_helpful from anon, authenticated;
revoke all on table public.place_review_helpful from anon, authenticated;
grant select on table public.event_review_helpful to authenticated;
grant select on table public.place_review_helpful to authenticated;
grant all on table public.event_review_helpful to service_role;
grant all on table public.place_review_helpful to service_role;

create policy event_review_helpful_own_select on public.event_review_helpful
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy place_review_helpful_own_select on public.place_review_helpful
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Keeps helpful_count equal to the number of vote rows. Runs as the table
-- owner so the counter update isn't subject to the review tables' RLS; the
-- column guard lets it through because it runs one trigger level deep.
create function public.sync_review_helpful_count()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_table_name = 'event_review_helpful' then
    if tg_op = 'INSERT' then
      update public.event_review
         set helpful_count = helpful_count + 1
       where id = new.review_id;
    else
      update public.event_review
         set helpful_count = greatest(helpful_count - 1, 0)
       where id = old.review_id;
    end if;
  else
    if tg_op = 'INSERT' then
      update public.place_review
         set helpful_count = helpful_count + 1
       where id = new.review_id;
    else
      update public.place_review
         set helpful_count = greatest(helpful_count - 1, 0)
       where id = old.review_id;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.sync_review_helpful_count() from public, anon, authenticated;

create trigger event_review_helpful_sync_count
  after insert or delete on public.event_review_helpful
  for each row execute function public.sync_review_helpful_count();
create trigger place_review_helpful_sync_count
  after insert or delete on public.place_review_helpful
  for each row execute function public.sync_review_helpful_count();

-- Stamps edited_at on a content change and pins both new columns on insert,
-- so a client can neither seed a vote count nor back-date an edit.
create function public.review_stamp_edit()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.helpful_count := 0;
    new.edited_at := null;
    return new;
  end if;

  if new.rating is distinct from old.rating
     or new.title is distinct from old.title
     or new.comment is distinct from old.comment then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;
revoke all on function public.review_stamp_edit() from public, anon, authenticated;

create trigger event_review_stamp_edit
  before insert or update on public.event_review
  for each row execute function public.review_stamp_edit();
create trigger place_review_stamp_edit
  before insert or update on public.place_review
  for each row execute function public.review_stamp_edit();

-- The existing column guards, plus: nobody signed in may change
-- helpful_count directly. The counter trigger's own update runs at trigger
-- depth 2 and passes; a client UPDATE runs at depth 1 and is refused.
create or replace function public.protect_event_review_privileged_columns()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_is_reviewer boolean := (select auth.uid()) = old.reviewer_id;
  v_is_organizer boolean := exists (
    select 1 from public.event e where e.id = old.event_id and e.organizer_id = (select auth.uid())
  );
begin
  if (select auth.uid()) is not null
     and pg_trigger_depth() <= 1
     and new.helpful_count is distinct from old.helpful_count then
    raise exception 'Not authorized to modify this field on this review'
      using errcode = '42501';
  end if;

  if v_is_reviewer and not v_is_organizer then
    if new.organizer_response is distinct from old.organizer_response
       or new.organizer_response_at is distinct from old.organizer_response_at
       or new.status is distinct from old.status
       or new.event_id is distinct from old.event_id
       or new.reviewer_id is distinct from old.reviewer_id then
      raise exception 'Not authorized to modify this field on your review';
    end if;
    return new;
  end if;

  if v_is_organizer and not v_is_reviewer then
    if new.rating is distinct from old.rating
       or new.title is distinct from old.title
       or new.comment is distinct from old.comment
       or new.status is distinct from old.status
       or new.event_id is distinct from old.event_id
       or new.reviewer_id is distinct from old.reviewer_id
       or new.is_verified_attendee is distinct from old.is_verified_attendee then
      raise exception 'Not authorized to modify this field on this review';
    end if;
    return new;
  end if;

  return new;
end;
$$;

create or replace function public.protect_place_review_privileged_columns()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_is_reviewer boolean := (select auth.uid()) = old.reviewer_id;
  v_is_owner boolean := exists (
    select 1 from public.place p where p.id = old.place_id and p.owner_id = (select auth.uid())
  );
begin
  if (select auth.uid()) is not null
     and pg_trigger_depth() <= 1
     and new.helpful_count is distinct from old.helpful_count then
    raise exception 'Not authorized to modify this field on this review'
      using errcode = '42501';
  end if;

  if v_is_reviewer and not v_is_owner then
    if new.owner_response is distinct from old.owner_response
       or new.owner_response_at is distinct from old.owner_response_at
       or new.status is distinct from old.status
       or new.place_id is distinct from old.place_id
       or new.reviewer_id is distinct from old.reviewer_id then
      raise exception 'Not authorized to modify this field on your review';
    end if;
    return new;
  end if;

  if v_is_owner and not v_is_reviewer then
    if new.rating is distinct from old.rating
       or new.title is distinct from old.title
       or new.comment is distinct from old.comment
       or new.status is distinct from old.status
       or new.place_id is distinct from old.place_id
       or new.reviewer_id is distinct from old.reviewer_id then
      raise exception 'Not authorized to modify this field on this review';
    end if;
    return new;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Indexes for the paged list (public rows only, like the rating index).
--    "Most recent": (subject, created_at desc, id desc).
--    "Most helpful": (subject, helpful_count desc, created_at desc, id desc).
--    A star filter: (subject, rating, created_at desc, id desc); a star
--    filter under "most helpful" sorts within that one rating's rows.
-- ---------------------------------------------------------------------------
create index idx_event_review_visible_recent
  on public.event_review (event_id, created_at desc, id desc)
  where status = 'approved'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';
create index idx_event_review_visible_helpful
  on public.event_review (event_id, helpful_count desc, created_at desc, id desc)
  where status = 'approved'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';
create index idx_event_review_visible_by_rating
  on public.event_review (event_id, rating, created_at desc, id desc)
  where status = 'approved'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';

create index idx_place_review_visible_recent
  on public.place_review (place_id, created_at desc, id desc)
  where status = 'approved'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';
create index idx_place_review_visible_helpful
  on public.place_review (place_id, helpful_count desc, created_at desc, id desc)
  where status = 'approved'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';
create index idx_place_review_visible_by_rating
  on public.place_review (place_id, rating, created_at desc, id desc)
  where status = 'approved'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';

-- ---------------------------------------------------------------------------
-- 4. review_summary
-- ---------------------------------------------------------------------------
create function public.review_summary(p_subject_kind text, p_subject_id uuid)
  returns table (
    average_rating numeric,
    total_ratings  integer,
    count_1        integer,
    count_2        integer,
    count_3        integer,
    count_4        integer,
    count_5        integer
  )
  language sql
  stable
  set search_path = ''
as $$
  with r as (
    select er.rating
      from public.event_review er
     where p_subject_kind = 'event'
       and er.event_id = p_subject_id
       and er.status = 'approved'
       and er.moderation_state is distinct from 'hidden'
       and er.moderation_state is distinct from 'removed'
    union all
    select pr.rating
      from public.place_review pr
     where p_subject_kind = 'place'
       and pr.place_id = p_subject_id
       and pr.status = 'approved'
       and pr.moderation_state is distinct from 'hidden'
       and pr.moderation_state is distinct from 'removed'
  )
  select
    coalesce(avg(r.rating), 0)::numeric,
    count(*)::integer,
    (count(*) filter (where r.rating = 1))::integer,
    (count(*) filter (where r.rating = 2))::integer,
    (count(*) filter (where r.rating = 3))::integer,
    (count(*) filter (where r.rating = 4))::integer,
    (count(*) filter (where r.rating = 5))::integer
  from r;
$$;
revoke all on function public.review_summary(text, uuid) from public;
grant execute on function public.review_summary(text, uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. review_list
-- ---------------------------------------------------------------------------
create function public.review_list(
  p_subject_kind   text,
  p_subject_id     uuid,
  p_rating         smallint    default null,
  p_sort           text        default 'helpful',
  p_after_helpful  integer     default null,
  p_after_created  timestamptz default null,
  p_after_id       uuid        default null,
  p_limit          integer     default 10,
  p_review_id      uuid        default null,
  p_exclude_viewer boolean     default false
)
  returns table (
    id                        uuid,
    subject_id                uuid,
    reviewer_id               uuid,
    rating                    smallint,
    title                     text,
    comment                   text,
    created_at                timestamptz,
    edited_at                 timestamptz,
    helpful_count             integer,
    viewer_found_helpful      boolean,
    is_verified_attendee      boolean,
    response                  text,
    response_at               timestamptz,
    reviewer_username         text,
    reviewer_full_name        text,
    reviewer_avatar_public_id text,
    reviewer_avatar_version   text,
    reviewer_deleted          boolean,
    photos                    jsonb
  )
  language plpgsql
  stable
  set search_path = ''
as $$
declare
  v_uid       uuid    := (select auth.uid());
  v_limit     integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_table     text;
  v_subject   text;
  v_votes     text;
  v_photos    text;
  v_photo_fk  text;
  v_response  text;
  v_verified  text;
  v_where     text := '';
  v_order     text;
  v_sql       text;
begin
  if p_subject_kind = 'event' then
    v_table := 'event_review';
    v_subject := 'event_id';
    v_votes := 'event_review_helpful';
    v_photos := 'event_review_photo';
    v_photo_fk := 'event_review_id';
    v_response := 'organizer_response';
    v_verified := 'r.is_verified_attendee';
  elsif p_subject_kind = 'place' then
    v_table := 'place_review';
    v_subject := 'place_id';
    v_votes := 'place_review_helpful';
    v_photos := 'place_review_photo';
    v_photo_fk := 'place_review_id';
    v_response := 'owner_response';
    v_verified := 'null::boolean';
  else
    raise exception 'Unknown review subject' using errcode = '22023';
  end if;

  if p_sort is null or p_sort not in ('helpful', 'recent') then
    raise exception 'Unknown review order' using errcode = '22023';
  end if;
  if p_rating is not null and p_rating not between 1 and 5 then
    raise exception 'Rating filter must be 1 to 5' using errcode = '22023';
  end if;

  -- Only the clauses that apply are added, so each call is planned against
  -- the matching partial index instead of a catch-all "$n is null or ...".
  if p_review_id is not null then
    v_where := v_where || ' and r.id = $3';
  else
    if p_rating is not null then
      v_where := v_where || ' and r.rating = $4';
    end if;
    if p_exclude_viewer and v_uid is not null then
      v_where := v_where || ' and r.reviewer_id <> $1';
    end if;
    if p_after_created is not null and p_after_id is not null then
      if p_sort = 'helpful' then
        v_where := v_where
          || ' and (r.helpful_count, r.created_at, r.id) < (coalesce($5, 0), $6, $7)';
      else
        v_where := v_where || ' and (r.created_at, r.id) < ($6, $7)';
      end if;
    end if;
  end if;

  if v_uid is not null then
    v_where := v_where || ' and not exists (
      select 1 from public.conversation_block b
       where b.blocker_id = $1
         and b.blocked_id = r.reviewer_id
         and b.conversation_id is null)';
  end if;

  if p_sort = 'helpful' then
    v_order := 'r.helpful_count desc, r.created_at desc, r.id desc';
  else
    v_order := 'r.created_at desc, r.id desc';
  end if;

  v_sql := format(
    $q$
    select
      r.id,
      r.%2$I,
      r.reviewer_id,
      r.rating,
      r.title,
      r.comment,
      r.created_at,
      r.edited_at,
      r.helpful_count,
      ($1 is not null and exists (
        select 1 from public.%3$I h where h.review_id = r.id and h.user_id = $1)),
      %4$s,
      r.%5$I,
      r.%6$I,
      u.username::text,
      u.full_name,
      u.avatar_public_id,
      u.avatar_version,
      coalesce(u.status_id = 4, true),
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id', p.id,
                   'public_id', p.public_id,
                   'version', p.version,
                   'position', p.position)
                 order by p.position)
          from public.%7$I p
         where p.%8$I = r.id), '[]'::jsonb)
    from public.%1$I r
    left join public.user_info u on u.id = r.reviewer_id
    where r.%2$I = $2
      and r.status = 'approved'
      and r.moderation_state is distinct from 'hidden'
      and r.moderation_state is distinct from 'removed'
      %9$s
    order by %10$s
    limit $8
    $q$,
    v_table, v_subject, v_votes, v_verified, v_response, v_response || '_at',
    v_photos, v_photo_fk, v_where, v_order
  );

  return query execute v_sql
    using v_uid, p_subject_id, p_review_id, p_rating,
          p_after_helpful, p_after_created, p_after_id, v_limit;
end;
$$;
revoke all on function public.review_list(text, uuid, smallint, text, integer, timestamptz, uuid, integer, uuid, boolean) from public;
grant execute on function public.review_list(text, uuid, smallint, text, integer, timestamptz, uuid, integer, uuid, boolean)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. review_set_helpful
-- ---------------------------------------------------------------------------
create function public.review_set_helpful(
  p_review_kind text,
  p_review_id   uuid,
  p_helpful     boolean
)
  returns table (helpful_count integer, viewer_found_helpful boolean)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_reviewer uuid;
  v_owner    uuid;
  v_visible  boolean;
  v_count    integer;
  v_voted    boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to mark reviews as helpful.' using errcode = '42501';
  end if;
  if public.account_is_restricted() then
    raise exception 'Your account has been restricted.' using errcode = '42501';
  end if;

  if p_review_kind = 'event' then
    select r.reviewer_id, e.organizer_id,
           r.status = 'approved'
             and r.moderation_state is distinct from 'hidden'
             and r.moderation_state is distinct from 'removed'
      into v_reviewer, v_owner, v_visible
      from public.event_review r
      join public.event e on e.id = r.event_id
     where r.id = p_review_id;
  elsif p_review_kind = 'place' then
    select r.reviewer_id, p.owner_id,
           r.status = 'approved'
             and r.moderation_state is distinct from 'hidden'
             and r.moderation_state is distinct from 'removed'
      into v_reviewer, v_owner, v_visible
      from public.place_review r
      join public.place p on p.id = r.place_id
     where r.id = p_review_id;
  else
    raise exception 'Unknown review subject' using errcode = '22023';
  end if;

  if v_reviewer is null or not coalesce(v_visible, false) then
    raise exception 'This review is no longer available.' using errcode = 'P0002';
  end if;
  if v_reviewer = v_uid then
    raise exception 'You can''t mark your own review as helpful.' using errcode = '23514';
  end if;
  if v_owner = v_uid then
    raise exception 'You can''t vote on reviews of your own listing.' using errcode = '23514';
  end if;
  if public.content_users_blocked(v_uid, v_reviewer) then
    raise exception 'This review isn''t available to you.' using errcode = '42501';
  end if;

  if p_review_kind = 'event' then
    if p_helpful then
      insert into public.event_review_helpful (review_id, user_id)
      values (p_review_id, v_uid)
      on conflict do nothing;
    else
      delete from public.event_review_helpful h
       where h.review_id = p_review_id and h.user_id = v_uid;
    end if;
    select r.helpful_count into v_count from public.event_review r where r.id = p_review_id;
    select exists (
      select 1 from public.event_review_helpful h
       where h.review_id = p_review_id and h.user_id = v_uid) into v_voted;
  else
    if p_helpful then
      insert into public.place_review_helpful (review_id, user_id)
      values (p_review_id, v_uid)
      on conflict do nothing;
    else
      delete from public.place_review_helpful h
       where h.review_id = p_review_id and h.user_id = v_uid;
    end if;
    select r.helpful_count into v_count from public.place_review r where r.id = p_review_id;
    select exists (
      select 1 from public.place_review_helpful h
       where h.review_id = p_review_id and h.user_id = v_uid) into v_voted;
  end if;

  helpful_count := v_count;
  viewer_found_helpful := v_voted;
  return next;
end;
$$;
revoke all on function public.review_set_helpful(text, uuid, boolean) from public, anon;
grant execute on function public.review_set_helpful(text, uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Account-wide block
-- ---------------------------------------------------------------------------
-- conversation_block with a null conversation_id already means "everywhere":
-- send_message refuses it, and content_users_blocked() (Spotlight, comments,
-- follows, notifications) reads it. Blocking also ends a follow between the
-- two people in either direction, because following is refused while a
-- block stands (followCore) and a follow left over from before would keep
-- one side's posts in the other's feed.
create function public.user_block_set(p_blocked_id uuid, p_block boolean default true)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Sign in to block someone.' using errcode = '42501';
  end if;
  if p_blocked_id is null or p_blocked_id = v_uid then
    raise exception 'You can''t block yourself.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.user_info where id = p_blocked_id) then
    raise exception 'That account no longer exists.' using errcode = 'P0002';
  end if;

  if p_block then
    insert into public.conversation_block (blocker_id, blocked_id, conversation_id)
    values (v_uid, p_blocked_id, null)
    on conflict do nothing;

    delete from public.follow f
     where f.target_kind = 'organizer'
       and ((f.follower_id = v_uid and f.target_id = p_blocked_id)
         or (f.follower_id = p_blocked_id and f.target_id = v_uid));
  else
    delete from public.conversation_block b
     where b.blocker_id = v_uid
       and b.blocked_id = p_blocked_id
       and b.conversation_id is null;
  end if;

  return p_block;
end;
$$;
revoke all on function public.user_block_set(uuid, boolean) from public, anon;
grant execute on function public.user_block_set(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Review photos follow their review's moderation state
-- ---------------------------------------------------------------------------
-- The photo read policies checked only status = 'approved', so a hidden or
-- removed review's photos stayed readable by id. They now match the review
-- read policy: the reviewer, the event's organizer / place's owner, or the
-- public when the review itself is public.
drop policy if exists event_review_photo_select on public.event_review_photo;
create policy event_review_photo_select on public.event_review_photo
  for select
  using (
    exists (
      select 1
        from public.event_review r
       where r.id = event_review_photo.event_review_id
         and (
           r.reviewer_id = (select auth.uid())
           or (r.status = 'approved'
               and r.moderation_state is distinct from 'hidden'
               and r.moderation_state is distinct from 'removed')
           or exists (
             select 1 from public.event e
              where e.id = r.event_id and e.organizer_id = (select auth.uid()))
         )
    )
  );

drop policy if exists place_review_photo_select on public.place_review_photo;
create policy place_review_photo_select on public.place_review_photo
  for select
  using (
    exists (
      select 1
        from public.place_review r
       where r.id = place_review_photo.place_review_id
         and (
           r.reviewer_id = (select auth.uid())
           or (r.status = 'approved'
               and r.moderation_state is distinct from 'hidden'
               and r.moderation_state is distinct from 'removed')
           or exists (
             select 1 from public.place p
              where p.id = r.place_id and p.owner_id = (select auth.uid()))
         )
    )
  );
