-- App store reviewers' sign-in (packages/services/src/profile/otpProviders/
-- appReviewOtpProvider.ts): the pending code for the one configured review
-- number is recorded with provider 'app_review', so the check goes back to
-- the fixed code instead of Hubtel or Twilio. Only the allowed values widen;
-- existing rows and every other number are untouched. market.otp_provider
-- keeps its own ('hubtel', 'twilio') check: no market can select App Review.
alter table public.phone_otp_state
  drop constraint phone_otp_state_provider_check;

alter table public.phone_otp_state
  add constraint phone_otp_state_provider_check
    check (provider in ('hubtel', 'twilio', 'app_review'));
