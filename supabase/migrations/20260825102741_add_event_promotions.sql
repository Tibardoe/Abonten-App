-- Unified Event Management, Milestone: Event Promotion (paid featuring).
-- Additive mirror of 20260826090000_add_place_promotions.sql -- same three-
-- table shape (seeded tier config, checkout, the "currently featured"
-- record), same reasoning for each decision:
-- 1. Pricing/duration tiers live in a seeded config table, not hardcoded UI
--    constants -- same precedent as place_promotion_tier.
-- 2. event_promotion_checkout mirrors place_promotion_checkout's exact shape
--    (a genuine one-off, non-inventory purchase, not ticket_checkout's
--    reservation/promo-code machinery).
-- 3. No organizer_ledger_entry row is written for promotion revenue -- same
--    reasoning as place_promotion: that table is hard-wired to "money owed
--    TO an organizer" (payout semantics), and promotion revenue is money
--    Abonten keeps, the opposite direction. The existing gateway-agnostic
--    `transaction` table (already has a generic 'Promotion_Purchase' reason
--    from the place_promotion migration -- no change needed there) is
--    sufficient.
-- Confirmed with the project owner: the free, self-toggled `event.featured`
-- checkbox keeps working exactly as before -- this is purely additive, a
-- second, paid way to become featured-eligible, not a replacement.

CREATE TABLE public.event_promotion_tier (
  id             smallint PRIMARY KEY,
  duration_label text     NOT NULL,
  duration       interval NOT NULL,
  price          numeric  NOT NULL,
  currency       text     DEFAULT 'GHS' NOT NULL,
  is_active      boolean  DEFAULT true NOT NULL
);

ALTER TABLE public.event_promotion_tier ADD CONSTRAINT event_promotion_tier_price_check CHECK (price >= 0);

GRANT ALL ON public.event_promotion_tier TO anon;
GRANT ALL ON public.event_promotion_tier TO authenticated;
GRANT ALL ON public.event_promotion_tier TO service_role;

INSERT INTO public.event_promotion_tier (id, duration_label, duration, price) VALUES
  (1, '24 hours', interval '24 hours', 20),
  (2, '3 days',    interval '3 days',   50),
  (3, '7 days',     interval '7 days',   100),
  (4, '1 month',   interval '1 month',  300);

-- Mirrors place_promotion_checkout's exact column set/defaults.
CREATE TABLE public.event_promotion_checkout (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  event_id     uuid                     NOT NULL,
  owner_id     uuid                     NOT NULL,
  tier_id      smallint                 NOT NULL,
  unit_price   numeric                  NOT NULL,
  total_price  numeric                  NOT NULL,
  currency     text                     NOT NULL,
  status       text                     DEFAULT 'pending' NOT NULL,
  expires_at   timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone
);

ALTER TABLE public.event_promotion_checkout ADD CONSTRAINT event_promotion_checkout_pkey PRIMARY KEY (id);
ALTER TABLE public.event_promotion_checkout ADD CONSTRAINT event_promotion_checkout_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;
ALTER TABLE public.event_promotion_checkout ADD CONSTRAINT event_promotion_checkout_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.user_info(id) ON DELETE CASCADE;
ALTER TABLE public.event_promotion_checkout ADD CONSTRAINT event_promotion_checkout_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.event_promotion_tier(id);

GRANT ALL ON public.event_promotion_checkout TO anon;
GRANT ALL ON public.event_promotion_checkout TO authenticated;
GRANT ALL ON public.event_promotion_checkout TO service_role;

CREATE INDEX idx_event_promotion_checkout_owner_id ON public.event_promotion_checkout (owner_id, created_at DESC);

-- The actual "currently featured via a paid promotion" record. Whether a
-- promotion is active is always computed from ends_at > now(), never stored
-- -- same convention as place_promotion.
CREATE TABLE public.event_promotion (
  id                     uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  event_id               uuid                     NOT NULL,
  tier_id                smallint                 NOT NULL,
  starts_at              timestamp with time zone DEFAULT now() NOT NULL,
  ends_at                timestamp with time zone NOT NULL,
  promotion_checkout_id  uuid                     NOT NULL,
  created_at             timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.event_promotion ADD CONSTRAINT event_promotion_pkey PRIMARY KEY (id);
ALTER TABLE public.event_promotion ADD CONSTRAINT event_promotion_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;
ALTER TABLE public.event_promotion ADD CONSTRAINT event_promotion_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.event_promotion_tier(id);
ALTER TABLE public.event_promotion ADD CONSTRAINT event_promotion_checkout_id_fkey FOREIGN KEY (promotion_checkout_id) REFERENCES public.event_promotion_checkout(id) ON DELETE RESTRICT;
ALTER TABLE public.event_promotion ADD CONSTRAINT event_promotion_dates_check CHECK (ends_at > starts_at);

GRANT ALL ON public.event_promotion TO anon;
GRANT ALL ON public.event_promotion TO authenticated;
GRANT ALL ON public.event_promotion TO service_role;

-- Powers "is this event currently featured" lookups. A partial index with
-- `WHERE ends_at > now()` isn't possible -- now() isn't IMMUTABLE -- a plain
-- index on ends_at is the correct fallback, same as idx_place_promotion_active.
CREATE INDEX idx_event_promotion_active ON public.event_promotion (ends_at);
CREATE INDEX idx_event_promotion_event_id ON public.event_promotion (event_id);

-- payment_attempt: add the fourth checkout target, widening the existing
-- exactly-one-of check from a 3-way sum (ticket/subscription/place
-- promotion) to a 4-way sum. finalizePaystackPayment.ts is the single
-- authoritative verify+finalize path for every payable thing in this app --
-- this is that path's fourth branch, not a parallel payment system.
--
ALTER TABLE public.payment_attempt ADD COLUMN event_promotion_checkout_id uuid;
ALTER TABLE public.payment_attempt ADD CONSTRAINT payment_attempt_event_promotion_checkout_id_fkey
  FOREIGN KEY (event_promotion_checkout_id) REFERENCES public.event_promotion_checkout(id) ON DELETE RESTRICT;

-- NOTE (2026-09-05, migration replay ordering audit): this specific
-- constraint (only this one -- the column/FK just above are self-
-- contained and fine) references place_promotion_checkout_id, added by
-- add_place_promotions.sql -- which carries the LATER true-applied version
-- 20260826090000 versus this file's own 20260825102741 (see docs/audit/
-- 01-limitations-register.md, "Migration replay ordering bug"). This
-- file's dominant content genuinely applied at its recorded version; this
-- one constraint was evidently widened in a later edit-and-rerun, without
-- a separate migration entry. A from-scratch `supabase db reset` fails
-- here unless this statement is neutralized or the file temporarily moved
-- after add_place_promotions -- known, narrow, not fixed at the source
-- since doing so would mean guessing at and rewriting production history
-- rather than accurately recording it.
ALTER TABLE public.payment_attempt DROP CONSTRAINT payment_attempt_target_check;
ALTER TABLE public.payment_attempt ADD CONSTRAINT payment_attempt_target_check CHECK (
  (
    (checkout_session_id IS NOT NULL)::integer +
    (subscription_checkout_id IS NOT NULL)::integer +
    (place_promotion_checkout_id IS NOT NULL)::integer +
    (event_promotion_checkout_id IS NOT NULL)::integer
  ) = 1
);

-- transaction.reason already has a generic 'Promotion_Purchase' value (added
-- by the place_promotion migration, not place-specific) -- no change needed
-- here; event promotions reuse it exactly.
