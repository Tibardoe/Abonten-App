-- Places feature Phase 2, Milestone 4: Bookings. Confirmed scope with the
-- user: reservation REQUEST only -- no in-app payment. The owner accepts or
-- declines; money (if any) changes hands off-platform. This deliberately
-- keeps the booking loop simple (no inventory/slot-capacity model, unlike
-- ticket_type) since it's a request/response flow, not a sale.
CREATE TABLE public.place_booking (
  id              uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  place_id        uuid                     NOT NULL,
  service_id      uuid,
  customer_id     uuid                     NOT NULL,
  requested_time  timestamp with time zone NOT NULL,
  party_size      integer,
  note            text,
  status          text                     DEFAULT 'pending' NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.place_booking ADD CONSTRAINT place_booking_pkey PRIMARY KEY (id);
ALTER TABLE public.place_booking ADD CONSTRAINT place_booking_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.place_booking ADD CONSTRAINT place_booking_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.place_service(id) ON DELETE SET NULL;
ALTER TABLE public.place_booking ADD CONSTRAINT place_booking_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.user_info(id) ON DELETE CASCADE;
ALTER TABLE public.place_booking ADD CONSTRAINT place_booking_party_size_check CHECK (party_size IS NULL OR party_size > 0);
ALTER TABLE public.place_booking ADD CONSTRAINT place_booking_status_check
  CHECK (status = ANY (ARRAY['pending', 'accepted', 'declined', 'cancelled']));

GRANT ALL ON public.place_booking TO anon;
GRANT ALL ON public.place_booking TO authenticated;
GRANT ALL ON public.place_booking TO service_role;

CREATE INDEX idx_place_booking_place_id ON public.place_booking (place_id, status, requested_time);
CREATE INDEX idx_place_booking_customer_id ON public.place_booking (customer_id, created_at DESC);
