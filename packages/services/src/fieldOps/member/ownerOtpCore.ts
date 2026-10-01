import { otpMessage } from "@abonten/core/otpMessages";
import { maskPhoneNumber } from "@abonten/core/phone/phone";
import type {
  FieldOpsConsentView,
  FieldOpsOnboarding,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { coreT, tr } from "../../i18n/requestLocale";
import { routeOtpForPhone } from "../../profile/otpProviders/otpRouter";
import type {
  OtpSendResult,
  OtpSenderCode,
  OtpVerifyResult,
} from "../../profile/otpProviders/types";
import { findOrCreateUserByPhone } from "../../profile/phoneAuthCore";
import { verifyPendingOtp } from "../../profile/phoneOtpSendCore";
import {
  claimOtpSend,
  clearPendingOtp,
  getPendingOtp,
  recordOtpSent,
  registerVerifyAttempt,
} from "../../profile/phoneOtpStore";
import { checkRateLimit } from "../../security/rateLimit";
import {
  deriveSigningKey,
  hmacBase64Url,
  signaturesMatch,
} from "../../security/signing";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import { type FieldOpsEnvelope, dbErr } from "../shared/fieldOpsRows";
import {
  ONBOARDING_COLUMNS,
  type OnboardingRow,
  appendTimeline,
  mapOnboarding,
} from "../shared/onboardingRows";
import { TIMELINE_NOTE } from "../shared/timelineNotes";

// The business owner's consent: a code goes to THEIR phone (Hubtel, purpose
// "fieldops-owner"); entering it proves the phone, records consent and
// makes (or finds) their Abonten account -- the account the listing is
// created under. The worker's own phone, or any team member's phone, is
// refused outright. Online members can hand the owner a consent link so
// the code never passes through the worker.

const OTP_PURPOSE = "fieldops-owner" as const;
const CONSENT_TTL_MS = 30 * 60 * 1000;
const FIELD_ROLES = ["offline_member", "online_member"] as const;

async function ownDraft(
  supabase: ServiceRoleClient,
  userId: string,
  campaignId: string,
  onboardingId: string,
): Promise<OnboardingRow | null> {
  const { data } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", onboardingId)
    .eq("campaign_id", campaignId)
    .eq("member_user_id", userId)
    .maybeSingle();
  return (data as unknown as OnboardingRow | null) ?? null;
}

// ── Consent link token (online mode) ────────────────────────

function consentKey() {
  return deriveSigningKey("fieldops-consent");
}

export function signConsentToken(
  onboardingId: string,
  phoneE164: string,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ o: onboardingId, p: phoneE164, e: now + CONSENT_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${hmacBase64Url(consentKey(), payload)}`;
}

export function readConsentToken(
  token: string,
  now = Date.now(),
): { onboardingId: string; phoneE164: string; expired: boolean } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    if (!signaturesMatch(hmacBase64Url(consentKey(), payload), sig))
      return null;
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      o?: string;
      p?: string;
      e?: number;
    };
    if (!parsed.o || !parsed.p || !parsed.e) return null;
    return {
      onboardingId: parsed.o,
      phoneE164: parsed.p,
      expired: parsed.e < now,
    };
  } catch {
    return null;
  }
}

export function consentPathFor(
  onboardingId: string,
  phoneE164: string,
): string {
  return `/consent/field/${signConsentToken(onboardingId, phoneE164)}`;
}

// ── Request ─────────────────────────────────────────────────

export type OwnerOtpRequestInput = {
  campaignId: string;
  onboardingId: string;
  ownerFullName: string;
  ownerPhoneE164: string;
};

export async function requestOwnerOtpCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: OwnerOtpRequestInput,
  deps: { sendOtp?: (phoneE164: string) => Promise<OtpSendResult> } = {},
): Promise<
  FieldOpsEnvelope<{
    ownerPhoneMasked: string;
    resendInSeconds: number;
    consentPath: string | null;
  }>
> {
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, FIELD_ROLES);
    if (m.campaignStatus !== "active") {
      return {
        status: 409,
        message: tr("theCampaignIsnTTakingNew4"),
      };
    }
  } catch (e) {
    return fieldOpsError(e);
  }
  const row = await ownDraft(
    supabase,
    userId,
    input.campaignId,
    input.onboardingId,
  );
  if (!row) return { status: 404, message: tr("onboardingNotFound") };
  if (row.status !== "draft" && row.status !== "needs_changes") {
    return {
      status: 409,
      message: tr("thisOnboardingHasAlreadyBeenSubmitted"),
    };
  }
  if (row.owner_user_id) {
    return {
      status: 409,
      message: tr("theOwnerHasAlreadyVerifiedTheir"),
    };
  }
  const phone = `+${input.ownerPhoneE164.replace(/\D/g, "")}`;

  // Never the worker's own phone, never any team member's phone.
  const { data: me } = await supabase.auth.admin.getUserById(userId);
  const myDigits = (me.user?.phone ?? "").replace(/\D/g, "");
  if (myDigits && myDigits === phone.replace(/\D/g, "")) {
    return {
      status: 400,
      message: tr("thatSYourOwnPhoneNumber2"),
    };
  }
  const { data: isMember } = await supabase.rpc(
    "fieldops_phone_belongs_to_member",
    {
      p_phone_e164: phone,
    },
  );
  if (isMember === true) {
    return {
      status: 409,
      message: tr("thatPhoneBelongsToAField"),
    };
  }

  const allowed = await checkRateLimit(`fieldops-otp:${userId}`, 20, 3600);
  if (!allowed) {
    return {
      status: 429,
      message: tr("tooManyCodesRequestedThisHour"),
    };
  }
  // Tests inject a fake sender; production routes by the number's market.
  let providerCode: OtpSenderCode = "hubtel";
  let send = deps.sendOtp;
  if (!send) {
    const route = await routeOtpForPhone(phone);
    if (!route.ok) return { status: 400, message: route.message };
    providerCode = route.provider.code;
    const provider = route.provider;
    send = (p) => provider.send(p, route.countryCode);
  }
  // The same atomic claim as a sign-in code (cooldown across purposes,
  // per-number caps, the send log the country ceiling reads).
  const claim = await claimOtpSend(phone, null);
  if (!claim.ok) return { status: claim.status, message: claim.message };
  const sent = await send(phone);
  if (!sent.ok) return { status: 502, message: sent.message };
  await recordOtpSent(
    OTP_PURPOSE,
    phone,
    sent.requestId,
    sent.prefix,
    providerCode,
  );

  const { error } = await supabase
    .from("fieldops_onboarding")
    .update({
      owner_full_name: input.ownerFullName,
      owner_phone_e164: phone,
    } as never)
    .eq("id", row.id);
  if (error) return dbErr(error, tr("couldNotSaveTheOwnerS"));
  await appendTimeline(supabase, {
    onboardingId: row.id,
    status: row.status,
    actorUserId: userId,
    actorKind: "member",
    note: TIMELINE_NOTE.ownerCodeSent,
    details: { phone: maskPhoneNumber(phone) },
  });
  return {
    status: 200,
    message: tr("codeSentToTheOwnerS"),
    data: {
      ownerPhoneMasked: maskPhoneNumber(phone),
      resendInSeconds: 60,
      consentPath: row.mode === "online" ? consentPathFor(row.id, phone) : null,
    },
  };
}

// ── Verify ──────────────────────────────────────────────────

async function confirmCode(
  phone: string,
  code: string,
  deps: {
    verifyOtp?: (
      requestId: string,
      prefix: string,
      code: string,
    ) => Promise<OtpVerifyResult>;
  },
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!/^\d{4,8}$/.test(code)) {
    return {
      ok: false,
      status: 400,
      message: otpMessage(coreT(), "invalidFormat"),
    };
  }
  if (!(await getPendingOtp(OTP_PURPOSE, phone))) {
    return { ok: false, status: 401, message: otpMessage(coreT(), "expired") };
  }
  if (!(await registerVerifyAttempt(OTP_PURPOSE, phone))) {
    return {
      ok: false,
      status: 429,
      message: otpMessage(coreT(), "tooManyAttempts"),
    };
  }
  const pending = await getPendingOtp(OTP_PURPOSE, phone);
  if (!pending)
    return { ok: false, status: 401, message: otpMessage(coreT(), "expired") };
  const result = deps.verifyOtp
    ? await deps.verifyOtp(pending.requestId, pending.prefix, code)
    : await verifyPendingOtp(pending, code);
  if (!result.ok) return { ok: false, status: 401, message: result.message };
  await clearPendingOtp(OTP_PURPOSE, phone);
  return { ok: true };
}

/**
 * After the code checked out: find-or-create the owner's account and pin
 * it to the onboarding. Exported on its own so the integration suite can
 * exercise the ownership rules without a live Hubtel.
 */
export async function attachOwnerCore(
  supabase: ServiceRoleClient,
  row: OnboardingRow,
  ownerUserId: string,
  isNewUser: boolean,
  actorUserId: string | null,
): Promise<FieldOpsEnvelope<FieldOpsOnboarding>> {
  if (ownerUserId === row.member_user_id) {
    return {
      status: 400,
      message: tr("theOwnerCanTBeThe"),
    };
  }
  const { data: memberRow } = await supabase
    .from("fieldops_team_member")
    .select("id")
    .eq("user_id", ownerUserId)
    .in("status", ["invited", "active", "suspended"])
    .limit(1)
    .maybeSingle();
  if (memberRow) {
    return {
      status: 409,
      message: tr("thatAccountBelongsToAField"),
    };
  }
  const [{ count: places }, { count: events }] = await Promise.all([
    supabase
      .from("place")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerUserId),
    supabase
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", ownerUserId),
  ]);
  const { data, error } = await supabase
    .from("fieldops_onboarding")
    .update({
      owner_user_id: ownerUserId,
      owner_phone_verified_at: new Date().toISOString(),
      owner_is_new_account: isNewUser,
      owner_prior_places: places ?? 0,
      owner_prior_events: events ?? 0,
    } as never)
    .eq("id", row.id)
    .is("owner_user_id", null)
    .select(ONBOARDING_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return {
        status: 409,
        message: tr("thisOwnerAlreadyHasAnOnboarding"),
      };
    }
    return dbErr(error, tr("couldNotRecordTheOwner"));
  }
  if (!data) return { status: 409, message: tr("theOwnerWasAlreadyRecorded") };
  await appendTimeline(supabase, {
    onboardingId: row.id,
    status: row.status,
    actorUserId,
    actorKind: actorUserId ? "member" : "system",
    note: TIMELINE_NOTE.ownerVerified,
    details: {
      new_account: isNewUser,
      prior_places: places ?? 0,
      prior_events: events ?? 0,
    },
  });
  return {
    status: 200,
    message: tr("ownerVerified"),
    data: mapOnboarding(data as unknown as OnboardingRow),
  };
}

export async function verifyOwnerOtpCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; onboardingId: string; code: string },
  deps: {
    verifyOtp?: (
      requestId: string,
      prefix: string,
      code: string,
    ) => Promise<OtpVerifyResult>;
  } = {},
): Promise<FieldOpsEnvelope<FieldOpsOnboarding>> {
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    requireMembership(ctx, input.campaignId, FIELD_ROLES);
  } catch (e) {
    return fieldOpsError(e);
  }
  const row = await ownDraft(
    supabase,
    userId,
    input.campaignId,
    input.onboardingId,
  );
  if (!row) return { status: 404, message: tr("onboardingNotFound") };
  if (row.owner_user_id)
    return { status: 409, message: tr("theOwnerIsAlreadyVerified") };
  if (!row.owner_phone_e164)
    return { status: 409, message: tr("sendTheOwnerACodeFirst") };
  const check = await confirmCode(row.owner_phone_e164, input.code, deps);
  if (!check.ok) return { status: check.status, message: check.message };
  const found = await findOrCreateUserByPhone(row.owner_phone_e164);
  if ("error" in found)
    return {
      status: 500,
      message: tr("somethingWentWrongRecordingTheOwner"),
    };
  return attachOwnerCore(supabase, row, found.userId, found.isNewUser, userId);
}

// ── Consent page (public, token-authorised) ─────────────────

export async function getConsentViewCore(
  supabase: ServiceRoleClient,
  token: string,
): Promise<FieldOpsEnvelope<FieldOpsConsentView>> {
  const parsed = readConsentToken(token);
  if (!parsed) return { status: 404, message: tr("thisLinkIsnTValid") };
  const { data } = await supabase
    .from("fieldops_onboarding")
    .select("id, business_name, owner_phone_e164, owner_user_id, status")
    .eq("id", parsed.onboardingId)
    .maybeSingle();
  if (!data || data.owner_phone_e164 !== parsed.phoneE164) {
    return { status: 404, message: tr("thisLinkIsnTValid") };
  }
  return {
    status: 200,
    data: {
      businessName: data.business_name,
      ownerPhoneMasked: maskPhoneNumber(parsed.phoneE164),
      verified: data.owner_user_id !== null,
      expired: parsed.expired,
    },
  };
}

export async function verifyConsentByTokenCore(
  supabase: ServiceRoleClient,
  input: { token: string; code: string },
  deps: {
    verifyOtp?: (
      requestId: string,
      prefix: string,
      code: string,
    ) => Promise<OtpVerifyResult>;
  } = {},
): Promise<FieldOpsEnvelope<{ verified: boolean }>> {
  const parsed = readConsentToken(input.token);
  if (!parsed) return { status: 404, message: tr("thisLinkIsnTValid") };
  if (parsed.expired)
    return {
      status: 410,
      message: tr("thisLinkHasExpiredAskFor"),
    };
  const { data } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", parsed.onboardingId)
    .maybeSingle();
  const row = data as unknown as OnboardingRow | null;
  if (!row || row.owner_phone_e164 !== parsed.phoneE164) {
    return { status: 404, message: tr("thisLinkIsnTValid") };
  }
  if (row.owner_user_id)
    return {
      status: 200,
      message: tr("alreadyVerified"),
      data: { verified: true },
    };
  const check = await confirmCode(parsed.phoneE164, input.code, deps);
  if (!check.ok) return { status: check.status, message: check.message };
  const found = await findOrCreateUserByPhone(parsed.phoneE164);
  if ("error" in found)
    return {
      status: 500,
      message: tr("somethingWentWrongRecordingYourConsent"),
    };
  const attached = await attachOwnerCore(
    supabase,
    row,
    found.userId,
    found.isNewUser,
    null,
  );
  if (attached.status !== 200)
    return { status: attached.status, message: attached.message };
  return {
    status: 200,
    message: tr("thankYouYourBusinessCanNow"),
    data: { verified: true },
  };
}
