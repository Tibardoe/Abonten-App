import { randomUUID } from "node:crypto";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import {
  ageOn,
  decideIdentityOutcome,
  idNumberLastFour,
  identityStateOf,
  isOpenIdentityStatus,
  outcomeFromStored,
} from "@abonten/core/identity/rules";
import { logger } from "@abonten/core/logger";
import type { Database, Json } from "@abonten/types/database.types";
import type {
  IdentityAttemptSummary,
  IdentityOverview,
  IdentityProviderKey,
  IdentityPurpose,
  IdentityResultStatus,
  IdentityVerificationStatus,
  StartIdentityVerificationResult,
} from "@abonten/types/identityType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  CompleteTestIdentityInput,
  IdentityVerificationIdInput,
  StartIdentityVerificationInput,
} from "@abonten/validation/identitySchemas";
import { tr } from "../i18n/requestLocale";
import { getMarketOrDefault } from "../markets/marketConfig";
import { createNotificationCore } from "../notifications/createNotification";
import { isAccountRestricted } from "../security/accountStatus";
import { documentHash, isIdentityHashReady, personHash } from "./identityHash";
import {
  type IdentitySettingRow,
  readIdentitySettings,
  resolveIdentityAccess,
} from "./identityProgram";
import {
  identityProviderByKey,
  identityProviderFor,
  testIdentityProviderAllowed,
} from "./providers/registry";
import type { IdentityProviderResult } from "./providers/types";

// Identity verification for the person themselves (web Server Actions and
// /api/mobile/identity/**) and the provider's callback. Every write goes
// through identity_transition(); the tables are service-role only.
//
// The flow: the person agrees, picks a document; Abonten creates the attempt
// and asks the provider for a single-use link; the person completes it on
// the provider's page (document + live selfie); the provider calls back; the
// verdict is confirmed with the provider's API, the document is checked
// against other accounts, and decideIdentityOutcome approves, refers to a
// person, rejects or fails it.

export type IdentityEnvelope<T = undefined> = {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503;
  message?: string;
  data?: T;
};

type Row = Database["public"]["Tables"]["identity_verification"]["Row"];

/** Bump when the consent wording on the identity page changes. */
export const IDENTITY_CONSENT_NOTICE_VERSION = "2026-10-23";

const fail = (): IdentityEnvelope<never> => ({
  status: 500,
  message: tr("somethingWentWrongPleaseTryAgain"),
});

const err = (
  status: IdentityEnvelope["status"],
  key: string,
  values?: Record<string, string | number>,
): IdentityEnvelope<never> => ({
  status,
  message: tr(`identity.${key}`, values),
});

/** The site the provider sends the person back to and calls. */
export function identityOrigin(): string {
  return (process.env.WEB_BASE_URL || PUBLIC_SITE_ORIGIN).replace(/\/+$/, "");
}

function providerPath(key: IdentityProviderKey): string {
  return key === "smile_id" ? "smile-id" : key;
}

function todayIso(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function loadPerson(svc: ServiceRoleClient, userId: string) {
  const { data, error } = await svc
    .from("user_info")
    .select(
      "id, status_id, country_code, full_name, identity_verified, identity_valid_until, identity_verification_id",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function liveVerified(person: {
  status_id: number | null;
  identity_verified: boolean;
  identity_valid_until: string | null;
}): boolean {
  return (
    person.identity_verified &&
    person.status_id === 1 &&
    !!person.identity_valid_until &&
    Date.parse(person.identity_valid_until) > Date.now()
  );
}

function summarize(row: Row): IdentityAttemptSummary {
  return {
    id: row.id,
    status: row.status as IdentityVerificationStatus,
    documentCountry: row.document_country,
    documentType: row.document_type,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    outcome: outcomeFromStored(
      row.status as IdentityVerificationStatus,
      row.result_status as IdentityResultStatus | null,
      row.result_reason,
      row.decision_reason,
    ),
  };
}

async function recentAttempts(svc: ServiceRoleClient, userId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await svc
    .from("identity_verification")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const dayAgo = Date.now() - 86_400_000;
  return {
    rows,
    today: rows.filter(
      (r) => Date.parse(r.created_at) > dayAgo && r.status !== "cancelled",
    ).length,
    month: rows.filter((r) => r.created_at > since && r.status !== "cancelled")
      .length,
  };
}

function attemptThatMatters(rows: Row[], liveId: string | null): Row | null {
  return (
    rows.find((r) =>
      isOpenIdentityStatus(r.status as IdentityVerificationStatus),
    ) ??
    rows.find((r) => r.status === "needs_review") ??
    (liveId ? rows.find((r) => r.id === liveId) : undefined) ??
    rows.find((r) => r.status !== "cancelled") ??
    null
  );
}

// ── The person's page ────────────────────────────────────────────────

export async function getIdentityOverviewCore(
  svc: ServiceRoleClient,
  userId: string,
): Promise<IdentityEnvelope<IdentityOverview>> {
  try {
    const { program, settings } = await resolveIdentityAccess(svc, userId);
    const person = await loadPerson(svc, userId);
    if (!person) return err(404, "accountNotFound");
    const market = await getMarketOrDefault(person.country_code);
    const provider = identityProviderFor(market.identity);
    const { rows, today } = await recentAttempts(svc, userId);
    const verified = liveVerified(person);
    const current = attemptThatMatters(rows, person.identity_verification_id);
    const live = verified
      ? rows.find((r) => r.id === person.identity_verification_id)
      : undefined;
    const open =
      current &&
      isOpenIdentityStatus(current.status as IdentityVerificationStatus)
        ? current
        : null;
    const resumeUrl =
      open?.link_url &&
      open.link_expires_at &&
      Date.parse(open.link_expires_at) > Date.now()
        ? open.link_url
        : null;

    return {
      status: 200,
      data: {
        program,
        state: identityStateOf(
          current
            ? { status: current.status as IdentityVerificationStatus }
            : null,
          verified,
        ),
        verifiedName: live?.legal_name ?? null,
        verifiedAt: verified ? (live?.decided_at ?? null) : null,
        validUntil: verified ? person.identity_valid_until : null,
        current: current ? summarize(current) : null,
        resumeUrl,
        documents:
          market.identity.documents.length > 0
            ? [
                {
                  country: market.countryCode,
                  options: market.identity.documents,
                },
              ]
            : [],
        attemptsLeftToday: Math.max(
          0,
          (settings?.attempts_per_day ?? 0) - today,
        ),
        providerReady:
          !!provider && provider.isConfigured() && isIdentityHashReady(),
      },
    };
  } catch (error) {
    logger.error(`getIdentityOverviewCore: ${error}`);
    return fail();
  }
}

/**
 * Where the provider sends the person when they finish: the website's
 * identity page, or (`app`) a public page that hands them back to the app,
 * because the app's browser carries no website session.
 */
export type IdentityReturnTo = "web" | "app";

export async function startIdentityVerificationCore(
  svc: ServiceRoleClient,
  userId: string,
  input: StartIdentityVerificationInput,
  opts: { returnTo?: IdentityReturnTo } = {},
): Promise<IdentityEnvelope<StartIdentityVerificationResult>> {
  try {
    const { program, settings } = await resolveIdentityAccess(svc, userId);
    if (!program.enabled || !settings) return err(403, "notAvailable");
    if (await isAccountRestricted(userId)) return err(403, "accountRestricted");

    const person = await loadPerson(svc, userId);
    if (!person) return err(404, "accountNotFound");
    if (
      liveVerified(person) &&
      person.identity_valid_until &&
      Date.parse(person.identity_valid_until) > Date.now() + 60 * 86_400_000
    ) {
      return err(409, "alreadyVerified");
    }

    const market = await getMarketOrDefault(person.country_code);
    const option = market.identity.documents.find(
      (d) => d.type === input.documentType,
    );
    if (input.documentCountry !== market.countryCode || !option) {
      return err(400, "documentNotOffered");
    }
    const provider = identityProviderFor(market.identity);
    if (!provider || !provider.isConfigured() || !isIdentityHashReady()) {
      return err(503, "notReady");
    }

    const { rows, today, month } = await recentAttempts(svc, userId);

    // An open attempt for the same document is reopened, not repeated.
    const open = rows.find((r) =>
      isOpenIdentityStatus(r.status as IdentityVerificationStatus),
    );
    if (open) {
      const usable =
        open.status === "created" &&
        open.document_type === input.documentType &&
        open.link_url &&
        open.link_expires_at &&
        Date.parse(open.link_expires_at) > Date.now() + 5 * 60_000;
      if (usable && open.link_url) {
        return {
          status: 200,
          data: { verificationId: open.id, url: open.link_url },
        };
      }
      if (open.status === "processing") return err(409, "stillChecking");
      const { error } = await svc.rpc("identity_transition", {
        p_verification_id: open.id,
        p_action: "cancel",
        p_actor_kind: "user",
        p_actor_id: userId,
        p_reason: "started again",
      });
      if (error) throw new Error(error.message);
    }

    if (today >= settings.attempts_per_day) return err(429, "tooManyToday");
    if (month >= settings.attempts_per_30_days) return err(429, "tooManyMonth");

    const id = randomUUID();
    const expiresAt = new Date(
      Date.now() + settings.link_expiry_hours * 3_600_000,
    ).toISOString();
    const { error: insertError } = await svc
      .from("identity_verification")
      .insert({
        id,
        user_id: userId,
        provider: provider.key,
        document_country: market.countryCode,
        document_type: option.type,
        verification_method: option.method,
        provider_user_ref: `abn_${id.replace(/-/g, "")}`,
        link_expires_at: expiresAt,
        consent_at: new Date().toISOString(),
        consent_notice_version: IDENTITY_CONSENT_NOTICE_VERSION,
        consent_locale: input.locale ?? "en",
      });
    if (insertError) {
      if (insertError.code === "23505") return err(409, "stillChecking");
      throw new Error(insertError.message);
    }

    const origin = identityOrigin();
    const session = await provider.createSession({
      verificationId: id,
      providerUserRef: `abn_${id.replace(/-/g, "")}`,
      country: market.countryCode,
      documentType: option.type,
      method: option.method,
      callbackUrl: `${origin}/api/identity/callback/${providerPath(provider.key)}`,
      redirectUrl:
        opts.returnTo === "app"
          ? `${origin}/identity/done?v=${id}&hl=${input.locale ?? "en"}`
          : `${origin}/settings/identity?checked=${id}`,
      privacyPolicyUrl: `${PUBLIC_SITE_ORIGIN}/legal/privacy`,
      logoUrl: `${PUBLIC_SITE_ORIGIN}/assets/images/brand/abonten-email-tile.png`,
      expiresAt,
    });
    if (!session.ok) {
      logger.error(
        `identity createSession(${provider.key}) ${session.reason}: ${session.detail}`,
      );
      await svc.rpc("identity_transition", {
        p_verification_id: id,
        p_action: "fail",
        p_actor_kind: "system",
        p_reason: "provider_unavailable",
      });
      return err(503, "providerUnavailable");
    }

    const { error: linkError } = await svc
      .from("identity_verification")
      .update({
        link_url: session.url,
        provider_link_ref: session.linkRef,
        link_expires_at: session.expiresAt,
      })
      .eq("id", id);
    if (linkError) {
      // Don't leave an open attempt with no page to go to.
      await svc.rpc("identity_transition", {
        p_verification_id: id,
        p_action: "fail",
        p_actor_kind: "system",
        p_reason: "link_not_saved",
      });
      throw new Error(linkError.message);
    }
    await svc.from("identity_verification_event").insert({
      verification_id: id,
      kind: "link_created",
      actor_kind: "user",
      actor_id: userId,
    });
    return { status: 201, data: { verificationId: id, url: session.url } };
  } catch (error) {
    logger.error(`startIdentityVerificationCore: ${error}`);
    return fail();
  }
}

/** The person stops an attempt they have not finished. */
export async function cancelIdentityVerificationCore(
  svc: ServiceRoleClient,
  userId: string,
  input: IdentityVerificationIdInput,
): Promise<IdentityEnvelope> {
  try {
    const { data: row } = await svc
      .from("identity_verification")
      .select("id, user_id, status")
      .eq("id", input.verificationId)
      .maybeSingle();
    if (!row || row.user_id !== userId) return err(404, "notFound");
    if (row.status !== "created" && row.status !== "submitted") {
      return err(409, "cannotCancel");
    }
    const { error } = await svc.rpc("identity_transition", {
      p_verification_id: row.id,
      p_action: "cancel",
      p_actor_kind: "user",
      p_actor_id: userId,
    });
    if (error) throw new Error(error.message);
    return { status: 200 };
  } catch (error) {
    logger.error(`cancelIdentityVerificationCore: ${error}`);
    return fail();
  }
}

// ── Deciding on a verdict ────────────────────────────────────────────

const NOTICE_FOR: Record<string, string> = {
  approve: "identity_approved",
  refer: "identity_in_review",
  reject: "identity_rejected",
  fail: "identity_failed",
};

export async function notifyIdentity(
  svc: ServiceRoleClient,
  userId: string,
  noticeId: string,
  params: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  try {
    await createNotificationCore(svc, {
      userId,
      type: noticeId,
      link: "/settings/identity",
      data: { kind: "identity" },
      notice: { id: noticeId, params },
    });
  } catch (error) {
    logger.error(
      `identity notify(${noticeId}) failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Applies a provider's verdict to an attempt: hashes and trims what is kept,
 * checks the document against other accounts, decides, and moves the
 * attempt in one call to identity_transition. `confirmedStatus` is the
 * verdict as the provider's own API gave it.
 */
export async function applyIdentityResult(
  svc: ServiceRoleClient,
  row: Row,
  result: IdentityProviderResult,
  confirmedStatus: IdentityResultStatus,
  settings: IdentitySettingRow | null,
): Promise<IdentityVerificationStatus> {
  const market = await getMarketOrDefault(row.document_country);
  const today = todayIso(market.defaultTimeZone);
  const minimumAge = settings?.minimum_age ?? 18;

  // When the callback and the provider's API disagree, the API wins and a
  // person looks: the callback's body is not covered by its signature.
  const mismatch = result.status !== confirmedStatus;
  const usable = !mismatch && confirmedStatus !== "error";

  const idHash = usable
    ? documentHash(row.document_country, row.document_type, result.idNumber)
    : null;
  const pHash = usable ? personHash(result.fullName, result.dateOfBirth) : null;
  const age =
    usable && result.dateOfBirth ? ageOn(result.dateOfBirth, today) : null;

  let matched: {
    user_id: string;
    account_status_id: number;
    revoked: boolean;
  }[] = [];
  if (idHash || pHash) {
    const { data, error } = await svc.rpc("identity_document_matches", {
      p_hash: idHash as string,
      p_person_hash: pHash as string,
      p_user_id: row.user_id,
    });
    if (error) throw new Error(error.message);
    matched = (data ?? []) as typeof matched;
  }

  const decision = mismatch
    ? {
        action: "refer" as const,
        outcome: null,
        reviewReason: "provider_status_mismatch",
      }
    : decideIdentityOutcome({
        resultStatus: confirmedStatus,
        resultReason: result.reason,
        fraudDetected: result.fraudDetected,
        providerDuplicate: result.providerDuplicate,
        isAdult: age === null ? null : age >= minimumAge,
        documentExpiresOn: result.documentExpiresOn,
        matchedAccounts: matched.length,
        matchedAccountClosedForCause: matched.some(
          (m) => m.account_status_id === 3 || m.revoked,
        ),
        autoApproveClear: settings?.auto_approve_clear ?? false,
        today,
      });

  const payload: Record<string, Json> = {
    result_status: confirmedStatus,
  };
  const put = (key: string, value: Json | undefined) => {
    if (value !== null && value !== undefined) payload[key] = value;
  };
  put("provider_job_id", result.providerJobId);
  put("result_reason", result.reason);
  put("risk_level", result.riskLevel);
  put("fraud_detected", result.fraudDetected);
  put("provider_duplicate", result.providerDuplicate);
  if (usable) {
    put("legal_name", result.fullName?.slice(0, 200) ?? null);
    put("date_of_birth", result.dateOfBirth);
    put(
      "id_number_last4",
      result.idNumber ? idNumberLastFour(result.idNumber) : null,
    );
    put("id_number_hash", idHash);
    put("person_hash", pHash);
    put("document_expires_on", result.documentExpiresOn);
    put("is_adult", age === null ? null : age >= minimumAge);
  }
  if (matched.length > 0) {
    payload.matched_user_ids = matched.map((m) => m.user_id);
  }

  const reason = decision.reviewReason ?? decision.outcome;
  const { data: moved, error } = await svc.rpc("identity_transition", {
    p_verification_id: row.id,
    p_action: decision.action,
    p_actor_kind: "provider",
    ...(reason ? { p_reason: reason } : {}),
    p_result: payload as Json,
  });
  if (error) {
    // The account was banned or closed in the meantime: nothing to approve.
    if (error.message.includes("identity_account_ineligible")) {
      const { error: referError } = await svc.rpc("identity_transition", {
        p_verification_id: row.id,
        p_action: "refer",
        p_actor_kind: "provider",
        p_reason: "account_not_active",
        p_result: payload as Json,
      });
      if (referError) throw new Error(referError.message);
      return "needs_review";
    }
    throw new Error(error.message);
  }

  const status = (moved as Row | null)?.status as IdentityVerificationStatus;
  const notice = NOTICE_FOR[decision.action];
  if (notice) {
    await notifyIdentity(svc, row.user_id, notice, {
      outcome: decision.outcome,
    });
  }
  return status;
}

// ── The provider's callback ──────────────────────────────────────────

export type IdentityCallbackAnswer = { status: 200 | 401 | 404 | 503 };

export async function handleIdentityCallbackCore(
  svc: ServiceRoleClient,
  providerKey: IdentityProviderKey,
  headers: Headers,
  rawBody: string,
): Promise<IdentityCallbackAnswer> {
  const provider = identityProviderByKey(providerKey);
  const verified = provider.verifyCallback(headers, rawBody);
  if (!verified.ok) {
    logger.warn(
      `identity callback (${providerKey}) refused: ${verified.reason}`,
    );
    return { status: 401 };
  }
  const result = verified.result;
  try {
    let query = svc.from("identity_verification").select("*");
    if (result.verificationId) {
      query = query.eq("id", result.verificationId);
    } else if (result.providerUserRef) {
      query = query.eq("provider_user_ref", result.providerUserRef);
    } else {
      return { status: 200 };
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as Row | null;
    // Not ours (another environment on the same provider account), or a
    // mismatched echo: acknowledged and ignored.
    if (
      !row ||
      row.provider !== providerKey ||
      (result.providerUserRef &&
        result.providerUserRef !== row.provider_user_ref)
    ) {
      logger.warn(`identity callback (${providerKey}) for an unknown attempt`);
      return { status: 200 };
    }
    if (!isOpenIdentityStatus(row.status as IdentityVerificationStatus)) {
      return { status: 200 };
    }

    if (result.status === "processing" || !result.providerJobId) {
      if (row.status !== "processing") {
        await svc.rpc("identity_transition", {
          p_verification_id: row.id,
          p_action: "process",
          p_actor_kind: "provider",
          ...(result.providerJobId
            ? { p_result: { provider_job_id: result.providerJobId } }
            : {}),
        });
      }
      return { status: 200 };
    }

    const confirmed = await provider.fetchStatus(result.providerJobId);
    if (!confirmed.ok) {
      logger.warn(`identity status check failed: ${confirmed.detail}`);
      return { status: 503 };
    }
    if (confirmed.status === "processing") return { status: 503 };
    if (confirmed.status === "not_found") {
      logger.warn("identity callback names a job the provider does not know");
      return { status: 200 };
    }

    const settings = await readIdentitySettings(svc);
    await applyIdentityResult(svc, row, result, confirmed.status, settings);
    return { status: 200 };
  } catch (error) {
    logger.error(`handleIdentityCallbackCore: ${error}`);
    return { status: 503 };
  }
}

// ── The stand-in provider (local and Preview only) ───────────────────

const TEST_OUTCOMES: Record<
  CompleteTestIdentityInput["outcome"],
  { status: IdentityResultStatus; reason: string | null; underage?: boolean }
> = {
  clear: { status: "clear", reason: null },
  attention: { status: "attention", reason: "document_copy_detected" },
  block: { status: "block", reason: "face_verification_failed" },
  error: { status: "error", reason: "image_unavailable_or_invalid" },
  underage: { status: "clear", reason: null, underage: true },
};

/**
 * The link is the key, as with a real provider's page: whoever opens it
 * (the person in the app's browser, signed out there) picks the verdict.
 * Only for attempts made with the stand-in, and only where it may run.
 */
export async function completeTestIdentityCore(
  svc: ServiceRoleClient,
  input: CompleteTestIdentityInput,
): Promise<IdentityEnvelope<{ status: IdentityVerificationStatus }>> {
  if (!testIdentityProviderAllowed()) return err(403, "notAvailable");
  try {
    const { data } = await svc
      .from("identity_verification")
      .select("*")
      .eq("id", input.verificationId)
      .maybeSingle();
    const row = data as Row | null;
    if (!row || row.provider !== "test") return err(404, "notFound");
    if (!isOpenIdentityStatus(row.status as IdentityVerificationStatus)) {
      return err(409, "cannotCancel");
    }
    const person = await loadPerson(svc, row.user_id);
    const pick = TEST_OUTCOMES[input.outcome];
    const year = new Date().getUTCFullYear() - (pick.underage ? 15 : 31);
    const clean = pick.status === "clear" || pick.status === "attention";
    const result: IdentityProviderResult = {
      providerJobId: `job_test_${row.id.replace(/-/g, "")}`,
      providerUserRef: row.provider_user_ref,
      verificationId: row.id,
      status: pick.status,
      reason: pick.reason,
      riskLevel: "low",
      fraudDetected: false,
      providerDuplicate: false,
      // Unique per account when the profile has no name, so two test
      // accounts only match when their names really are the same.
      fullName: clean
        ? person?.full_name || `Test Person ${row.user_id.slice(0, 8)}`
        : null,
      dateOfBirth: clean ? `${year}-05-17` : null,
      // The same number for the same account, so a second check of it
      // matches the first and two accounts never do by accident.
      idNumber: clean
        ? `TEST${row.user_id.replace(/-/g, "").slice(0, 12)}`
        : null,
      documentExpiresOn: clean
        ? `${new Date().getUTCFullYear() + 4}-12-31`
        : null,
    };
    const settings = await readIdentitySettings(svc);
    const status = await applyIdentityResult(
      svc,
      row,
      result,
      pick.status,
      settings,
    );
    return { status: 200, data: { status } };
  } catch (error) {
    logger.error(`completeTestIdentityCore: ${error}`);
    return fail();
  }
}

// ── Requirements ─────────────────────────────────────────────────────

/**
 * Null when the person may go ahead; otherwise the answer to give them. A
 * requirement holds only for people the programme is open to (see
 * identityProgram.ts), so it never blocks someone who cannot verify.
 */
export async function requireVerifiedIdentity(
  svc: ServiceRoleClient,
  userId: string,
  purpose: IdentityPurpose,
): Promise<IdentityEnvelope<never> | null> {
  try {
    const { program } = await resolveIdentityAccess(svc, userId);
    if (!program.requiredFor.includes(purpose)) return null;
    const person = await loadPerson(svc, userId);
    if (person && liveVerified(person)) return null;
    return err(409, `required.${purpose}`);
  } catch (error) {
    // A requirement that cannot be checked holds: money and trust gates
    // fail closed.
    logger.error(`requireVerifiedIdentity(${purpose}): ${error}`);
    return err(503, "checkUnavailable");
  }
}

/** Whether a person's identity is live (for staff tools and badges). */
export async function isIdentityVerified(
  svc: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  const person = await loadPerson(svc, userId);
  return !!person && liveVerified(person);
}
