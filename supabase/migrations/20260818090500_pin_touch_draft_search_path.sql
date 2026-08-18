CREATE OR REPLACE FUNCTION public.touch_draft() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  NEW.expires_at := now() + interval '48 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
