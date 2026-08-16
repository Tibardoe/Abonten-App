-- payment_method: lifecycle + missing partitions (currently has none — inserts fail)
ALTER TABLE public.payment_method
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE public.payment_method
  ADD CONSTRAINT payment_method_status_check CHECK (status IN ('active', 'removed'));

CREATE TABLE public.payment_method_p0 PARTITION OF public.payment_method FOR VALUES WITH (modulus 4, remainder 0);
GRANT ALL ON public.payment_method_p0 TO anon;
GRANT ALL ON public.payment_method_p0 TO authenticated;
GRANT ALL ON public.payment_method_p0 TO service_role;

CREATE TABLE public.payment_method_p1 PARTITION OF public.payment_method FOR VALUES WITH (modulus 4, remainder 1);
GRANT ALL ON public.payment_method_p1 TO anon;
GRANT ALL ON public.payment_method_p1 TO authenticated;
GRANT ALL ON public.payment_method_p1 TO service_role;

CREATE TABLE public.payment_method_p2 PARTITION OF public.payment_method FOR VALUES WITH (modulus 4, remainder 2);
GRANT ALL ON public.payment_method_p2 TO anon;
GRANT ALL ON public.payment_method_p2 TO authenticated;
GRANT ALL ON public.payment_method_p2 TO service_role;

CREATE TABLE public.payment_method_p3 PARTITION OF public.payment_method FOR VALUES WITH (modulus 4, remainder 3);
GRANT ALL ON public.payment_method_p3 TO anon;
GRANT ALL ON public.payment_method_p3 TO authenticated;
GRANT ALL ON public.payment_method_p3 TO service_role;

-- One default ACTIVE method per user, enforced in the database. Valid on a
-- partitioned table because the partition key (user_id) is part of the index.
CREATE UNIQUE INDEX payment_method_one_default_per_user
  ON public.payment_method (user_id)
  WHERE is_default = true AND status = 'active';

-- payment_attempt: separates "an attempt to pay" from the checkout it pays
-- for and the method used, so a future gateway has a real row to drive
-- through a lifecycle instead of mutating checkout status directly.
CREATE TABLE public.payment_attempt (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES public.user_info(id) ON DELETE CASCADE,
  checkout_session_id       uuid,
  subscription_checkout_id  uuid REFERENCES public.subscription_checkout(id) ON DELETE RESTRICT,
  payment_method_id         uuid,
  amount                    numeric(15,2) NOT NULL CHECK (amount >= 0),
  currency                  varchar(3) NOT NULL DEFAULT 'GHS',
  status                    text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated','pending','processing','succeeded','failed','cancelled','refunded')),
  provider_reference        text,
  transaction_id            uuid REFERENCES public.transaction(id) ON DELETE SET NULL,
  created_at                timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_attempt_target_check CHECK (
    (checkout_session_id IS NOT NULL AND subscription_checkout_id IS NULL) OR
    (checkout_session_id IS NULL AND subscription_checkout_id IS NOT NULL)
  ),
  -- Composite FK because payment_method's PK is (id, user_id) — it's
  -- hash-partitioned by user_id, so any unique constraint on it must include
  -- that column. RESTRICT (not SET NULL) because user_id here is NOT NULL,
  -- and payment_method rows are only ever soft-deleted in practice anyway.
  CONSTRAINT payment_attempt_payment_method_fkey FOREIGN KEY (payment_method_id, user_id)
    REFERENCES public.payment_method (id, user_id) ON DELETE RESTRICT
);

CREATE INDEX idx_payment_attempt_checkout_session ON public.payment_attempt (checkout_session_id) WHERE checkout_session_id IS NOT NULL;
CREATE INDEX idx_payment_attempt_subscription_checkout ON public.payment_attempt (subscription_checkout_id) WHERE subscription_checkout_id IS NOT NULL;
CREATE INDEX idx_payment_attempt_user_id ON public.payment_attempt (user_id);

GRANT ALL ON public.payment_attempt TO anon;
GRANT ALL ON public.payment_attempt TO authenticated;
GRANT ALL ON public.payment_attempt TO service_role;
