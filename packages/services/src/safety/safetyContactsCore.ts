import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import {
  parsePhoneWithDialCode,
  phoneErrorMessage,
} from "@abonten/core/phone/phone";
import {
  INVITE_MAX_SENDS,
  INVITE_RESEND_AFTER_MS,
} from "@abonten/core/safety/rules";
import type { Database } from "@abonten/types/database.types";
import type {
  SafetyContact,
  SafetyContactStatus,
  SafetyRelationship,
} from "@abonten/types/safetyType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  AddSafetyContactInput,
  UpdateSafetyContactInput,
} from "@abonten/validation/safetySchemas";
import { coreT } from "../i18n/requestLocale";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { checkRateLimit } from "../security/rateLimit";
import {
  type SafetyDeps,
  optedOutPhones,
  queueInvite,
  sendSafetyMessages,
} from "./safetyNotifyCore";
import { canTextNumber, loadSafetyPerson } from "./safetyPeople";
import { resolveSafetyAccess, safetyLimits } from "./safetyProgram";
import {
  PG_RAISE,
  PG_UNIQUE_VIOLATION,
  type SafetyEnvelope,
  safetyError,
  safetyFail,
} from "./safetyShared";
import { inviteTokenFor, safetyTokenHash } from "./safetyTokens";

// A person's trusted contacts. Adding one texts them once ("Ama added you as
// an emergency contact…") with a link to accept, decline, or stop all
// Abonten Safety texts to their number; the number is then never texted
// again by this person (or by anyone) unless they accepted.

type ContactRow = Database["public"]["Tables"]["safety_contact"]["Row"];

const digits = (phone: string | null | undefined) =>
  (phone ?? "").replace(/\D/g, "");

export async function mapSafetyContact(
  row: ContactRow,
  now: number = Date.now(),
): Promise<SafetyContact> {
  const canText = await canTextNumber(row.phone_e164);
  const waited =
    !row.invited_at ||
    now - Date.parse(row.invited_at) >= INVITE_RESEND_AFTER_MS;
  return {
    id: row.id,
    name: row.name,
    phoneE164: row.phone_e164,
    email: row.email,
    relationship: row.relationship as SafetyRelationship,
    locale: row.locale,
    position: row.position,
    status: row.status as SafetyContactStatus,
    linked: row.contact_user_id !== null,
    invitedAt: row.invited_at,
    inviteCount: row.invite_count,
    respondedAt: row.responded_at,
    canText,
    canResendInvite:
      row.status === "pending" &&
      row.invite_count < INVITE_MAX_SENDS &&
      (canText || !!row.email) &&
      waited,
    createdAt: row.created_at,
  };
}

export async function readContactRows(
  svc: ServiceRoleClient,
  userId: string,
): Promise<ContactRow[]> {
  const { data, error } = await svc
    .from("safety_contact")
    .select("*")
    .eq("user_id", userId)
    .order("position")
    .order("created_at");
  if (error) throw new Error(`safety contacts read failed: ${error.message}`);
  return data ?? [];
}

export async function listSafetyContactsCore(
  svc: ServiceRoleClient,
  userId: string,
): Promise<SafetyEnvelope<SafetyContact[]>> {
  try {
    const rows = await readContactRows(svc, userId);
    return {
      status: 200,
      data: await Promise.all(rows.map((r) => mapSafetyContact(r))),
    };
  } catch (error) {
    logger.error(`listSafetyContactsCore: ${error}`);
    return safetyFail();
  }
}

/** Invite texts this person's Safety sent in the last day. */
async function invitesSentToday(
  svc: ServiceRoleClient,
  userId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count } = await svc
    .from("safety_message")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("purpose", "invite")
    .eq("channel", "sms")
    .gte("created_at", since);
  return count ?? 0;
}

async function sendInvite(
  svc: ServiceRoleClient,
  contact: ContactRow,
  invitesPerDay: number,
  deps: SafetyDeps,
): Promise<void> {
  const allowSms =
    (await invitesSentToday(svc, contact.user_id)) < invitesPerDay;
  const ids = await queueInvite(svc, contact, allowSms);
  await sendSafetyMessages(svc, { ids }, deps);
}

export async function addSafetyContactCore(
  svc: ServiceRoleClient,
  userId: string,
  input: AddSafetyContactInput,
  deps: SafetyDeps = {},
): Promise<SafetyEnvelope<SafetyContact>> {
  try {
    const { program, settings } = await resolveSafetyAccess(svc, userId);
    if (!program.enabled) return safetyError(403, "notAvailable");
    if (await isAccountRestricted(userId)) {
      return { status: 403, message: restrictedAccountMessage() };
    }
    const person = await loadSafetyPerson(svc, userId);
    if (!person.phoneE164) return safetyError(409, "verifyPhoneFirst");
    if (!person.hasProfileName) return safetyError(409, "addNameFirst");

    const parsed = parsePhoneWithDialCode(input.dialCode, input.phone);
    if (!parsed.ok) {
      return { status: 400, message: phoneErrorMessage(coreT(), parsed.error) };
    }
    const phone = parsed.e164;
    if (digits(phone) === digits(person.phoneE164)) {
      return safetyError(400, "contactIsYou");
    }
    if ((await optedOutPhones(svc, userId, [phone])).has(phone)) {
      return safetyError(409, "contactOptedOut");
    }

    const limits = safetyLimits(settings);
    const existing = await readContactRows(svc, userId);
    if (existing.some((c) => c.phone_e164 === phone)) {
      return safetyError(409, "contactExists");
    }
    if (existing.length >= limits.max_contacts) {
      return safetyError(409, "tooManyContacts", { max: limits.max_contacts });
    }
    if (
      !(await checkRateLimit(`safety-contact-add:${userId}`, 10, 24 * 60 * 60))
    ) {
      return safetyError(429, "tooManyAdds");
    }

    const id = randomUUID();
    const reachable = (await canTextNumber(phone)) || !!input.email;
    const { data: row, error } = await svc
      .from("safety_contact")
      .insert({
        id,
        user_id: userId,
        name: input.name.trim(),
        phone_e164: phone,
        email: input.email ?? null,
        relationship: input.relationship,
        locale: input.locale,
        position:
          existing.reduce((max, c) => Math.max(max, c.position), -1) + 1,
        invite_token_hash: safetyTokenHash(inviteTokenFor(id)),
        invite_count: reachable ? 1 : 0,
        invited_at: reachable ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (error || !row) {
      if (error?.code === PG_UNIQUE_VIOLATION)
        return safetyError(409, "contactExists");
      if (error?.code === PG_RAISE) {
        return safetyError(409, "tooManyContacts", {
          max: limits.max_contacts,
        });
      }
      logger.error(`addSafetyContactCore insert: ${error?.message}`);
      return safetyFail();
    }
    if (reachable) await sendInvite(svc, row, limits.invites_per_day, deps);
    return { status: 201, data: await mapSafetyContact(row) };
  } catch (error) {
    logger.error(`addSafetyContactCore: ${error}`);
    return safetyFail();
  }
}

export async function updateSafetyContactCore(
  svc: ServiceRoleClient,
  userId: string,
  input: UpdateSafetyContactInput,
): Promise<SafetyEnvelope<SafetyContact>> {
  try {
    const rows = await readContactRows(svc, userId);
    const row = rows.find((c) => c.id === input.contactId);
    if (!row) return safetyError(404, "contactNotFound");
    const patch: Database["public"]["Tables"]["safety_contact"]["Update"] = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.email !== undefined) patch.email = input.email ?? null;
    if (input.relationship !== undefined)
      patch.relationship = input.relationship;
    if (input.locale !== undefined) patch.locale = input.locale;
    if (input.makeFirst) {
      patch.position =
        rows.reduce((min, c) => Math.min(min, c.position), 0) - 1;
    }
    if (Object.keys(patch).length === 0) {
      return { status: 200, data: await mapSafetyContact(row) };
    }
    const { data, error } = await svc
      .from("safety_contact")
      .update(patch)
      .eq("id", row.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error || !data) {
      logger.error(`updateSafetyContactCore: ${error?.message}`);
      return safetyFail();
    }
    return { status: 200, data: await mapSafetyContact(data) };
  } catch (error) {
    logger.error(`updateSafetyContactCore: ${error}`);
    return safetyFail();
  }
}

export async function removeSafetyContactCore(
  svc: ServiceRoleClient,
  userId: string,
  contactId: string,
): Promise<SafetyEnvelope> {
  const { data, error } = await svc
    .from("safety_contact")
    .delete()
    .eq("id", contactId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    logger.error(`removeSafetyContactCore: ${error.message}`);
    return safetyFail();
  }
  if (!data || data.length === 0) return safetyError(404, "contactNotFound");
  return { status: 200 };
}

export async function resendSafetyInviteCore(
  svc: ServiceRoleClient,
  userId: string,
  contactId: string,
  deps: SafetyDeps = {},
): Promise<SafetyEnvelope<SafetyContact>> {
  try {
    const { program, settings } = await resolveSafetyAccess(svc, userId);
    if (!program.enabled) return safetyError(403, "notAvailable");
    if (await isAccountRestricted(userId)) {
      return { status: 403, message: restrictedAccountMessage() };
    }
    const rows = await readContactRows(svc, userId);
    const row = rows.find((c) => c.id === contactId);
    if (!row) return safetyError(404, "contactNotFound");
    if (row.status !== "pending")
      return safetyError(409, "inviteAlreadyAnswered");
    const mapped = await mapSafetyContact(row);
    if (row.invite_count >= INVITE_MAX_SENDS)
      return safetyError(409, "inviteLimit");
    if (!mapped.canResendInvite) return safetyError(429, "inviteNotYet");

    const { data: updated, error } = await svc
      .from("safety_contact")
      .update({
        invite_count: row.invite_count + 1,
        invited_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("invite_count", row.invite_count)
      .select("*")
      .single();
    if (error || !updated) return safetyError(429, "inviteNotYet");
    await sendInvite(
      svc,
      updated,
      safetyLimits(settings).invites_per_day,
      deps,
    );
    return { status: 200, data: await mapSafetyContact(updated) };
  } catch (error) {
    logger.error(`resendSafetyInviteCore: ${error}`);
    return safetyFail();
  }
}
