-- wallet was missed by the earlier add_wallet_rls.sql migration (that
-- migration, despite its filename, only covered payment_attempt/
-- payment_method -- confirmed live: wallet still had RLS fully disabled).
-- Currently has 0 partitions (known gap, can't hold rows yet), but closing
-- this properly now rather than leaving it as the one exception, and so
-- wallet_public's new security_invoker setting is backed by real RLS on
-- the table it selects from. SELECT-only for the owner: balance should
-- only ever move via trusted server-side logic, never a direct client
-- UPDATE, matching payout/organizer_ledger_entry's pattern.
ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_owner_select ON public.wallet
  FOR SELECT USING ((select auth.uid()) = user_id);
