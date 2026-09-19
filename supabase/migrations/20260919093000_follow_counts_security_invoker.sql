-- follow_counts no longer needs SECURITY DEFINER: since 20260919092000 it
-- reads follow_count, which every role may read (public-read policy), not
-- the private follow rows. Running it as the caller removes a definer
-- function from the anon/authenticated surface (advisor 0028/0029).
alter function public.follow_counts(text, uuid[]) security invoker;
