ALTER TABLE public.highlight
  ADD COLUMN public_id text;

ALTER TABLE public.highlight
  ADD CONSTRAINT highlight_public_id_check CHECK (public_id ~* '^[a-z0-9_\/-]+$');
