import { maskPhoneNumber } from "@abonten/core/normalizePhoneNumber";
import { HUBTEL_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import { OTP_MESSAGES } from "@abonten/core/otpMessages";
import type {
  FieldOpsConsentView,
  FieldOpsOnboarding,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { sendHubtelOtp, verifyHubtelOtp } from "../../profile/hubtelOtpClient";
import { findOrCreateUserByPhone } from "../../profile/phoneAuthCore";
import {
  clearPendingOtp,
  getPendingOtp,
  getResendCooldownRemainingMs,
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
  deps: { sendOtp?: typeof sendHubtelOtp } = {},
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
        message: "The campaign isn't taking new onboardings.",
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
  if (!row) return { status: 404, message: "Onboarding not found" };
  if (row.status !== "draft" && row.status !== "needs_changes") {
    return {
      status: 409,
      message: "This onboarding has already been submitted.",
    };
  }
  if (row.owner_user_id) {
    return {
      status: 409,
      message: "The owner has already verified their phone.",
    };
  }
  const phone = `+${input.ownerPhoneE164.replace(/\D/g, "")}`;

  // Never the worker's own phone, never any team member's phone.
  const { data: me } = await supabase.auth.admin.getUserById(userId);
  const myDigits = (me.user?.phone ?? "").replace(/\D/g, "");
  if (myDigits && myDigits === phone.replace(/\D/g, "")) {
    return {
      status: 400,
      message: "That's your own phone number. The owner must use theirs.",
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
      message:
        "That phone belongs to a Field Ops team member and can't be a business owner here.",
    };
  }

  const allowed = await checkRateLimit(`fieldops-otp:${userId}`, 20, 3600);
  if (!allowed) {
    return {
      status: 429,
      message: "Too many codes requested this hour. Try again later.",
    };
  }
  const cooldown = await getResendCooldownRemainingMs(OTP_PURPOSE, phone);
  if (cooldown > 0) {
    return {
      status: 429,
      message: `Please wait ${Math.ceil(cooldown / 1000)}s before sending another code.`,
    };
  }
  const send = deps.sendOtp ?? sendHubtelOtp;
  const sent = await send(phone);
  if (!sent.ok) return { status: 502, message: sent.message };
  await recordOtpSent(OTP_PURPOSE, phone, sent.requestId, sent.prefix);

  const { error } = await supabase
    .from("fieldops_onboarding")
    .update({
      owner_full_name: input.ownerFullName,
      owner_phone_e164: phone,
    } as never)
    .eq("id", row.id);
  if (error) return dbErr(error, "Could not save the owner's details");
  await appendTimeline(supabase, {
    onboardingId: row.id,
    status: row.status,
    actorUserId: userId,
    actorKind: "member",
    note: "Owner code sent",
    details: { phone: maskPhoneNumber(phone) },
  });
  return {
    status: 200,
    message: "Code sent to the owner's phone.",
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
  deps: { verifyOtp?: typeof verifyHubtelOtp },
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!new RegExp(`^\\d{${HUBTEL_OTP_CODE_LENGTH}}$`).test(code)) {
    return { ok: false, status: 400, message: OTP_MESSAGES.invalidFormat };
  }
  if (!(await getPendingOtp(OTP_PURPOSE, phone))) {
    return { ok: false, status: 401, message: OTP_MESSAGES.expired };
  }
  if (!(await registerVerifyAttempt(OTP_PURPOSE, phone))) {
    return { ok: false, status: 429, message: OTP_MESSAGES.tooManyAttempts };
  }
  const pending = await getPendingOtp(OTP_PURPOSE, phone);
  if (!pending)
    return { ok: false, status: 401, message: OTP_MESSAGES.expired };
  const verify = deps.verifyOtp ?? verifyHubtelOtp;
  const result = await verify(pending.requestId, pending.prefix, code);
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
      message: "The owner can't be the member submitting the onboarding.",
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
      message: "That account belongs to a Field Ops team member.",
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
        message:
          "This owner already has an onboarding in this campaign. Ask your team lead.",
      };
    }
    return dbErr(error, "Could not record the owner");
  }
  if (!data) return { status: 409, message: "The owner was already recorded." };
  await appendTimeline(supabase, {
    onboardingId: row.id,
    status: row.status,
    actorUserId,
    actorKind: actorUserId ? "member" : "system",
    note: "Owner verified their phone",
    details: {
      new_account: isNewUser,
      prior_places: places ?? 0,
      prior_events: events ?? 0,
    },
  });
  return {
    status: 200,
    message: "Owner verified.",
    data: mapOnboarding(data as unknown as OnboardingRow),
  };
}

export async function verifyOwnerOtpCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; onboardingId: string; code: string },
  deps: { verifyOtp?: typeof verifyHubtelOtp } = {},
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
  if (!row) return { status: 404, message: "Onboarding not found" };
  if (row.owner_user_id)
    return { status: 409, message: "The owner is already verified." };
  if (!row.owner_phone_e164)
    return { status: 409, message: "Send the owner a code first." };
  const check = await confirmCode(row.owner_phone_e164, input.code, deps);
  if (!check.ok) return { status: check.status, message: check.message };
  const found = await findOrCreateUserByPhone(row.owner_phone_e164);
  if ("error" in found)
    return {
      status: 500,
      message: "Something went wrong recording the owner.",
    };
  return attachOwnerCore(supabase, row, found.userId, found.isNewUser, userId);
}

// ── Consent page (public, token-authorised) ─────────────────

export async function getConsentViewCore(
  supabase: ServiceRoleClient,
  token: string,
): Promise<FieldOpsEnvelope<FieldOpsConsentView>> {
  const parsed = readConsentToken(token);
  if (!parsed) return { status: 404, message: "This link isn't valid." };
  const { data } = await supabase
    .from("fieldops_onboarding")
    .select("id, business_name, owner_phone_e164, owner_user_id, status")
    .eq("id", parsed.onboardingId)
    .maybeSingle();
  if (!data || data.owner_phone_e164 !== parsed.phoneE164) {
    return { status: 404, message: "This link isn't valid." };
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
  deps: { verifyOtp?: typeof verifyHubtelOtp } = {},
): Promise<FieldOpsEnvelope<{ verified: boolean }>> {
  const parsed = readConsentToken(input.token);
  if (!parsed) return { status: 404, message: "This link isn't valid." };
  if (parsed.expired)
    return {
      status: 410,
      message: "This link has expired. Ask for a new code.",
    };
  const { data } = await supabase
    .from("fieldops_onboarding")
    .select(ONBOARDING_COLUMNS)
    .eq("id", parsed.onboardingId)
    .maybeSingle();
  const row = data as unknown as OnboardingRow | null;
  if (!row || row.owner_phone_e164 !== parsed.phoneE164) {
    return { status: 404, message: "This link isn't valid." };
  }
  if (row.owner_user_id)
    return {
      status: 200,
      message: "Already verified.",
      data: { verified: true },
    };
  const check = await confirmCode(parsed.phoneE164, input.code, deps);
  if (!check.ok) return { status: check.status, message: check.message };
  const found = await findOrCreateUserByPhone(parsed.phoneE164);
  if ("error" in found)
    return {
      status: 500,
      message: "Something went wrong recording your consent.",
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
    message: "Thank you. Your business can now be listed.",
    data: { verified: true },
  };
}
