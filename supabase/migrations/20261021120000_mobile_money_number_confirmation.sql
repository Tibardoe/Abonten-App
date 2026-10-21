-- A mobile money number is confirmed before it is saved, as a buyer's wallet
-- (payment_method) or an organizer's payout account (payout_account): a code
-- is texted to it, unless it is the person's own verified phone
-- (@abonten/services/payments/mobileMoneyNumberCheck). A mistyped number
-- otherwise sent payment requests, or an organizer's earnings, to a stranger.
--
-- The code has its own purpose, so it can never be replayed as a sign-in or a
-- phone change, and those codes never confirm a wallet.

alter table public.phone_otp_state drop constraint if exists phone_otp_state_purpose_check;
alter table public.phone_otp_state
  add constraint phone_otp_state_purpose_check
  check (purpose in ('sign-in', 'phone-update', 'fieldops-owner', 'wallet'));
