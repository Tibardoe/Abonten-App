-- Places feature Phase 2, Milestone 5: Featured Places (paid promotion).
-- Confirmed decisions from planning:
-- 1. Pricing/duration tiers live in a seeded config table, not hardcoded UI
--    constants (matches the spec's explicit "don't hardcode pricing"
--    instruction, same precedent as place_category's seeded rows).
-- 2. place_promotion_checkout mirrors subscription_checkout's exact shape
--    (id default gen_random_uuid(), same column set/defaults) -- confirmed
--    live via `select ... from information_schema.columns where
--    table_name='subscription_checkout'` before writing this -- because
--    Featured Places is a genuine one-off, non-inventory purchase, the same
--    shape as a subscription purchase, not ticket_checkout's
--    reservation/promo-code machinery.
-- 3. No organizer_ledger_entry row is written for promotion revenue --
--    confirmed by reading 20260819110000_add_organizer_finances_ledger.sql:
--    that table's columns/RLS/CHECKs are hard-wired to "money owed TO an
--    organizer" (payout semantics). Promotion revenue is money Abonten
--    keeps, the opposite direction -- the existing gateway-agnostic
--    `transaction` table (new reason value, below) is sufficient.

CREATE TABLE public.place_promotion_tier (
  id             smallint PRIMARY KEY,
  duration_label text     NOT NULL,
  duration       interval NOT NULL,
  price          numeric  NOT NULL,
  currency       text     DEFAULT 'GHS' NOT NULL,
  is_active      boolean  DEFAULT true NOT NULL
);

ALTER TABLE public.place_promotion_tier ADD CONSTRAINT place_promotion_tier_price_check CHECK (price >= 0);

GRANT ALL ON public.place_promotion_tier TO anon;
GRANT ALL ON public.place_promotion_tier TO authenticated;
GRANT ALL ON public.place_promotion_tier TO service_role;

INSERT INTO public.place_promotion_tier (id, duration_label, duration, price) VALUES
  (1, '24 hours', interval '24 hours', 20),
  (2, '3 days',    interval '3 days',   50),
  (3, '7 days',     interval '7 days',   100),
  (4, '1 month',   interval '1 month',  300);

-- Mirrors subscription_checkout's exact column set/defaults (verified live
-- before writing this) -- id default gen_random_uuid(), same nullable
-- shape.
CREATE TABLE public.place_promotion_checkout (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  place_id     uuid                     NOT NULL,
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

ALTER TABLE public.place_promotion_checkout ADD CONSTRAINT place_promotion_checkout_pkey PRIMARY KEY (id);
ALTER TABLE public.place_promotion_checkout ADD CONSTRAINT place_promotion_checkout_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.place_promotion_checkout ADD CONSTRAINT place_promotion_checkout_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.user_info(id) ON DELETE CASCADE;
ALTER TABLE public.place_promotion_checkout ADD CONSTRAINT place_promotion_checkout_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.place_promotion_tier(id);

GRANT ALL ON public.place_promotion_checkout TO anon;
GRANT ALL ON public.place_promotion_checkout TO authenticated;
GRANT ALL ON public.place_promotion_checkout TO service_role;

CREATE INDEX idx_place_promotion_checkout_owner_id ON public.place_promotion_checkout (owner_id, created_at DESC);

-- The actual "currently featured" record. Whether a promotion is active is
-- always computed from ends_at > now(), never stored -- same convention as
-- promo_code.is_active being computed at insert time rather than kept live
-- by a trigger.
CREATE TABLE public.place_promotion (
  id                     uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  place_id               uuid                     NOT NULL,
  tier_id                smallint                 NOT NULL,
  starts_at              timestamp with time zone DEFAULT now() NOT NULL,
  ends_at                timestamp with time zone NOT NULL,
  promotion_checkout_id  uuid                     NOT NULL,
  created_at             timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.place_promotion ADD CONSTRAINT place_promotion_pkey PRIMARY KEY (id);
ALTER TABLE public.place_promotion ADD CONSTRAINT place_promotion_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.place_promotion ADD CONSTRAINT place_promotion_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.place_promotion_tier(id);
ALTER TABLE public.place_promotion ADD CONSTRAINT place_promotion_checkout_id_fkey FOREIGN KEY (promotion_checkout_id) REFERENCES public.place_promotion_checkout(id) ON DELETE RESTRICT;
ALTER TABLE public.place_promotion ADD CONSTRAINT place_promotion_dates_check CHECK (ends_at > starts_at);

GRANT ALL ON public.place_promotion TO anon;
GRANT ALL ON public.place_promotion TO authenticated;
GRANT ALL ON public.place_promotion TO service_role;

-- Powers "is this place currently featured" lookups and the Explore page's
-- Featured Places section (queried with `WHERE ends_at > now()` at query
-- time). A partial index with that predicate isn't possible here --
-- now() isn't IMMUTABLE, so Postgres rejects it in an index predicate --
-- a plain index on ends_at is the correct fallback.
CREATE INDEX idx_place_promotion_active ON public.place_promotion (ends_at);
CREATE INDEX idx_place_promotion_place_id ON public.place_promotion (place_id);

-- payment_attempt: add the third checkout target, extending the existing
-- exactly-one-of check (verified live: currently
-- "(checkout_session_id IS NOT NULL AND subscription_checkout_id IS NULL)
--  OR (checkout_session_id IS NULL AND subscription_checkout_id IS NOT NULL)")
-- to a 3-way version. finalizePaystackPayment.ts is the single authoritative
-- verify+finalize path for every payable thing in this app (tickets,
-- subscriptions, and now promotions) -- this is that path's third branch,
-- not a parallel payment system.
ALTER TABLE public.payment_attempt ADD COLUMN place_promotion_checkout_id uuid;
ALTER TABLE public.payment_attempt ADD CONSTRAINT payment_attempt_place_promotion_checkout_id_fkey
  FOREIGN KEY (place_promotion_checkout_id) REFERENCES public.place_promotion_checkout(id) ON DELETE RESTRICT;

ALTER TABLE public.payment_attempt DROP CONSTRAINT payment_attempt_target_check;
ALTER TABLE public.payment_attempt ADD CONSTRAINT payment_attempt_target_check CHECK (
  (
    (checkout_session_id IS NOT NULL)::integer +
    (subscription_checkout_id IS NOT NULL)::integer +
    (place_promotion_checkout_id IS NOT NULL)::integer
  ) = 1
);

-- transaction.reason: add the third purchase kind.
ALTER TABLE public.transaction DROP CONSTRAINT transaction_reason_check;
ALTER TABLE public.transaction ADD CONSTRAINT transaction_reason_check
  CHECK (reason = ANY (ARRAY['Ticket_Purchase', 'Plan_Purchase', 'Promotion_Purchase']));

-- place_analytics_event: a Featured Places impression is a distinct signal
-- from a normal profile "view" click-through, per spec §36 ("track
-- impressions/clicks").
ALTER TABLE public.place_analytics_event DROP CONSTRAINT place_analytics_event_type_check;
ALTER TABLE public.place_analytics_event ADD CONSTRAINT place_analytics_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'view', 'direction_click', 'phone_click', 'whatsapp_click',
    'website_click', 'booking_click', 'promotion_impression'
  ]));
