ALTER TABLE public.ticket_checkout
  ADD COLUMN expires_at timestamp with time zone,
  ADD COLUMN completed_at timestamp with time zone,
  ADD COLUMN discounted_units integer DEFAULT 0 NOT NULL;

ALTER TABLE public.ticket_checkout
  ADD CONSTRAINT ticket_checkout_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'expired'::text]));

ALTER TABLE public.subscription_checkout
  ADD COLUMN expires_at timestamp with time zone;

ALTER TABLE public.subscription_checkout
  ADD CONSTRAINT subscription_checkout_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'expired'::text]));

CREATE FUNCTION public.compute_subscription_end_date(plan_id smallint, from_date timestamp with time zone)
RETURNS timestamp with time zone
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT from_date + duration FROM public.subscription_plan WHERE id = plan_id;
$$;
