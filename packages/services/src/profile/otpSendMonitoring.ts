// Whether text-message codes are actually going out.
//
// The `hubtel` health probe only proves Hubtel's server answers: when the
// account cannot pay for messages (Hubtel answers HTTP 400 with business
// status 12, "Payment required on account", seen on 2026-09-20) the probe
// stays green while nobody can sign in with a phone number. So every send
// the provider refuses is recorded in the error pipeline (app_error_event,
// grouped per provider and reason in Admin › Monitoring › Errors), and the
// `otp` health check compares those failures with the sends attempted
// (phone_otp_send_log gets a row for every send that passed the limits).
// Every attempt in the window failing = down; three runs down open an
// incident, which is emailed to the super-admins.
//
// Nothing here stores a phone number or a code: the provider's message is
// stored with long digit runs masked.

import { logger } from "@abonten/core/logger";
import { computeFingerprint } from "@abonten/core/reportError";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { ingestErrorCore } from "../admin/observability/observabilityCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

export const OTP_SEND_FAILED_ERROR_TYPE = "OtpSendFailed";
export const OTP_HEALTH_WINDOW_MINUTES = 30;

/** Masks anything that could be a phone number (7+ digits, with or without +). */
export function redactPhoneDigits(text: string): string {
  return text.replace(/\+?\d[\d\s-]{5,}\d/g, "<number>");
}

/**
 * Records one send the provider refused or that never reached it. Never
 * throws: monitoring must not change what the person is told.
 */
export async function recordOtpSendFailure(input: {
  provider: string;
  countryCode: string;
  reason: string;
  detail?: string;
}): Promise<void> {
  try {
    const message = redactPhoneDigits(
      input.detail ?? `${input.provider} OTP send failed (${input.reason})`,
    ).slice(0, 2000);
    const { status } = await ingestErrorCore(getSupabaseServiceClient(), {
      // One group per provider and reason, whatever the provider's wording.
      fingerprint: computeFingerprint(
        OTP_SEND_FAILED_ERROR_TYPE,
        `${input.provider} ${input.reason}`,
        null,
        "api",
        "otp-send",
      ),
      errorType: OTP_SEND_FAILED_ERROR_TYPE,
      message,
      stack: null,
      platform: "api",
      route: "otp-send",
      appVersion: null,
      release: null,
      severity: "error",
      userId: null,
      context: {
        provider: input.provider,
        country: input.countryCode,
        reason: input.reason,
      },
      occurredAt: new Date().toISOString(),
    });
    if (status >= 400) logger.error("Could not record an OTP send failure");
  } catch (error) {
    logger.error("Could not record an OTP send failure", error);
  }
}

export type OtpSendHealth = {
  windowMinutes: number;
  attempted: number;
  failed: number;
  lastFailure: { message: string; at: string } | null;
};

/** Down only when there were failures and nothing in the window got through. */
export function otpSendHealthy(h: Pick<OtpSendHealth, "attempted" | "failed">) {
  return h.failed === 0 || h.attempted > h.failed;
}

export async function readOtpSendHealth(
  serviceClient: ServiceRoleClient,
): Promise<OtpSendHealth> {
  const since = new Date(
    Date.now() - OTP_HEALTH_WINDOW_MINUTES * 60_000,
  ).toISOString();
  const [attempts, failures] = await Promise.all([
    serviceClient
      .from("phone_otp_send_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    serviceClient
      .from("app_error_event")
      .select("message, occurred_at", { count: "exact" })
      .eq("error_type", OTP_SEND_FAILED_ERROR_TYPE)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(1),
  ]);
  if (attempts.error) throw new Error(attempts.error.message);
  if (failures.error) throw new Error(failures.error.message);
  const last = failures.data?.[0];
  return {
    windowMinutes: OTP_HEALTH_WINDOW_MINUTES,
    attempted: attempts.count ?? 0,
    failed: failures.count ?? 0,
    lastFailure: last
      ? { message: last.message ?? "", at: last.occurred_at }
      : null,
  };
}
