-- Global markets, part 4: credit reporting per currency.
--
-- Each person's Abonten Credit is in one currency (their home market's,
-- 20260924100100). The admin overview summed every account, which is only
-- right while one currency exists: the moment a second market opens it
-- would add naira to cedis. The overview now reports one currency at a
-- time (the default market's when none is asked for) and lists the
-- currencies that have credit, so the console can switch between them.
--
-- Forward-only and additive: the old two-argument signature is replaced by
-- one with a defaulted third argument, so existing callers keep working.

drop function if exists public.admin_rewards_overview(timestamptz, timestamptz);

create or replace function public.admin_rewards_overview(
  p_from     timestamptz,
  p_to       timestamptz,
  p_currency text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cur as (
    select upper(coalesce(nullif(trim(p_currency), ''), public.default_market_currency())) as code
  )
  select jsonb_build_object(
    'currency', (select code from cur),
    'currencies', (
      select coalesce(jsonb_agg(distinct a.currency order by a.currency), '[]'::jsonb)
      from public.credit_account a
    ),
    'balances', (
      select jsonb_build_object(
        'accounts', count(*),
        'frozen_accounts', count(*) filter (where a.status = 'frozen'),
        'in_debt_accounts', count(*) filter (where a.available_minor < 0),
        'available_minor', coalesce(sum(greatest(a.available_minor, 0)), 0),
        'debt_minor', coalesce(sum(least(a.available_minor, 0)), 0),
        'pending_minor', coalesce(sum(a.pending_minor), 0),
        'reserved_minor', coalesce(sum(a.reserved_minor), 0),
        'frozen_minor', coalesce(sum(a.frozen_minor), 0),
        'withdrawing_minor', coalesce(sum(a.withdrawing_minor), 0),
        'lifetime_earned_minor', coalesce(sum(a.lifetime_earned_minor), 0),
        'lifetime_spent_minor', coalesce(sum(a.lifetime_spent_minor), 0),
        'lifetime_expired_minor', coalesce(sum(a.lifetime_expired_minor), 0),
        'lifetime_reversed_minor', coalesce(sum(a.lifetime_reversed_minor), 0)
      )
      from public.credit_account a, cur
      where a.status <> 'closed' and a.currency = cur.code
    ),
    'promotion_only_minor', (
      select coalesce(sum(l.remaining_minor - l.held_minor), 0)
      from public.credit_lot l, cur
      where l.status = 'active' and l.spend_scope = 'promotions' and l.currency = cur.code
    ),
    'flows', (
      select coalesce(jsonb_object_agg(x.journal_type, x.total_minor), '{}'::jsonb)
      from (
        select j.journal_type, sum(abs(j.user_delta_minor)) as total_minor
        from public.credit_journal j, cur
        where j.created_at >= p_from and j.created_at < p_to and j.currency = cur.code
        group by j.journal_type
      ) x
    ),
    'pending_adjustments', (
      select count(*) from public.credit_adjustment_request r where r.status = 'pending'
    ),
    'open_disputes', (
      select count(*) from public.payment_dispute d where d.resolved_at is null
    )
  );
$$;

revoke all on function public.admin_rewards_overview(timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.admin_rewards_overview(timestamptz, timestamptz, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Spotlight: campaign money per currency. Counts (posts, views, follows) stay
-- global; paid / delivered / refunded / unused budget are reported for one
-- currency, like the credit overview above.
-- ---------------------------------------------------------------------------
drop function if exists public.content_admin_overview(timestamptz, timestamptz);

create or replace function public.content_admin_overview(
  p_from     timestamptz,
  p_to       timestamptz,
  p_currency text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'spotlight', jsonb_build_object(
      'posts', (select count(*) from public.content_post p where p.kind = 'spotlight' and p.published_at between p_from and p_to),
      'activeCreators', (select count(distinct p.author_id) from public.content_post p where p.kind = 'spotlight' and p.published_at between p_from and p_to),
      'livePosts', (select count(*) from public.content_post p where p.kind = 'spotlight' and p.status = 'published' and p.moderation_state = 'visible'),
      'impressions', (select coalesce(sum(d.impressions), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'meaningfulViews', (select coalesce(sum(d.meaningful_views), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'completions', (select coalesce(sum(d.completions), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'likes', (select count(*) from public.content_like l join public.content_post p on p.id = l.post_id where p.kind = 'spotlight' and l.created_at between p_from and p_to),
      'comments', (select count(*) from public.content_comment c join public.content_post p on p.id = c.post_id where p.kind = 'spotlight' and c.created_at between p_from and p_to),
      'shares', (select count(*) from public.content_share s join public.content_post p on p.id = s.post_id where p.kind = 'spotlight' and s.created_at between p_from and p_to),
      'saves', (select count(*) from public.content_save s join public.content_post p on p.id = s.post_id where p.kind = 'spotlight' and s.created_at between p_from and p_to),
      'eventClicks', (select coalesce(sum(d.event_clicks + d.ticket_clicks), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'placeClicks', (select coalesce(sum(d.place_clicks), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'profileClicks', (select coalesce(sum(d.profile_clicks), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'spotlight' and d.day between p_from::date and p_to::date),
      'conversions', (select count(*) from public.content_campaign_conversion cv where cv.created_at between p_from and p_to)
    ),
    'stories', jsonb_build_object(
      'posts', (select count(*) from public.content_post p where p.kind = 'story' and p.published_at between p_from and p_to),
      'activePublishers', (select count(distinct coalesce(p.publisher_place_id, p.author_id)) from public.content_post p where p.kind = 'story' and p.published_at between p_from and p_to),
      'live', (select count(*) from public.content_post p where p.kind = 'story' and public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)),
      'viewStarts', (select coalesce(sum(d.view_starts), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'story' and d.day between p_from::date and p_to::date),
      'completions', (select coalesce(sum(d.completions), 0) from public.content_post_daily_stat d join public.content_post p on p.id = d.post_id where p.kind = 'story' and d.day between p_from::date and p_to::date),
      'reactions', (select count(*) from public.content_reaction r join public.content_post p on p.id = r.post_id where p.kind = 'story' and r.created_at between p_from and p_to),
      'comments', (select count(*) from public.content_comment c join public.content_post p on p.id = c.post_id where p.kind = 'story' and c.created_at between p_from and p_to)
    ),
    'social', jsonb_build_object(
      'follows', (select count(*) from public.follow f where f.created_at between p_from and p_to),
      'totalFollows', (select count(*) from public.follow),
      'reportsOpen', (select count(*) from public.report r where r.target_type in ('spotlight', 'story', 'content_comment') and r.status in ('new', 'under_review', 'awaiting_info', 'escalated')),
      'moderated', (select count(*) from public.content_post p where p.moderation_state <> 'visible')
    ),
    'campaigns', jsonb_build_object(
      'currency', upper(coalesce(nullif(trim(p_currency), ''), public.default_market_currency())),
      'currencies', (select coalesce(jsonb_agg(distinct c.currency order by c.currency), '[]'::jsonb) from public.content_campaign c),
      'created', (select count(*) from public.content_campaign c where c.created_at between p_from and p_to),
      'advertisers', (select count(distinct c.advertiser_id) from public.content_campaign c where c.paid_minor > 0 and c.created_at between p_from and p_to),
      'pendingReview', (select count(*) from public.content_campaign c where c.status = 'pending_review'),
      'active', (select count(*) from public.content_campaign c where c.status = 'active'),
      'paidMinor', (select coalesce(sum(l.amount_minor), 0) from public.content_campaign_ledger l where l.entry_type = 'payment' and l.currency = upper(coalesce(nullif(trim(p_currency), ''), public.default_market_currency())) and l.created_at between p_from and p_to),
      'spentMinor', (select coalesce(sum(l.amount_minor), 0) from public.content_campaign_ledger l where l.entry_type = 'accrual' and l.currency = upper(coalesce(nullif(trim(p_currency), ''), public.default_market_currency())) and l.created_at between p_from and p_to),
      'refundedMinor', (select coalesce(sum(l.amount_minor), 0) from public.content_campaign_ledger l where l.entry_type = 'refund' and l.currency = upper(coalesce(nullif(trim(p_currency), ''), public.default_market_currency())) and l.created_at between p_from and p_to),
      'impressions', (select coalesce(sum(c.impression_count), 0) from public.content_campaign c where c.created_at between p_from and p_to),
      'reach', (select coalesce(sum(c.reach_count), 0) from public.content_campaign c where c.created_at between p_from and p_to),
      'clicks', (select coalesce(sum(c.click_count), 0) from public.content_campaign c where c.created_at between p_from and p_to),
      'conversions', (select coalesce(sum(c.conversion_count), 0) from public.content_campaign c where c.created_at between p_from and p_to),
      'unusedToReviewMinor', (select coalesce(sum(c.paid_minor - c.spent_minor - c.refunded_minor), 0) from public.content_campaign c where c.status in ('completed', 'cancelled') and c.currency = upper(coalesce(nullif(trim(p_currency), ''), public.default_market_currency())))
    )
  )
$$;

revoke all on function public.content_admin_overview(timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.content_admin_overview(timestamptz, timestamptz, text)
  to service_role;
