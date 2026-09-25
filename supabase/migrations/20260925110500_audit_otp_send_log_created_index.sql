-- Full-system audit 2026-09-25: the OTP router now counts the last hour of
-- sends per country (the SMS-pumping circuit breaker in otpRouter.ts); this
-- index keeps that count a short range scan as the log grows.
create index if not exists phone_otp_send_log_created_idx
  on public.phone_otp_send_log (created_at);
