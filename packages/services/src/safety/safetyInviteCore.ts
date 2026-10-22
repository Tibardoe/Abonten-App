import { logger } from "@abonten/core/logger";
import type {
  SafetyContactStatus,
  SafetyInviteResponse,
  SafetyInviteView,
} from "@abonten/types/safetyType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { checkRateLimit } from "../security/rateLimit";
import { notifyPerson } from "./safetyNotifyCore";
import { loadSafetyPerson } from "./safetyPeople";
import {
  PG_UNIQUE_VIOLATION,
  type SafetyEnvelope,
  safetyError,
  safetyFail,
} from "./safetyShared";
import { safetyTokenHash } from "./safetyTokens";

// The page a new trusted contact opens from their invite text
// (/trusted/<token>). No account needed. Accepting while signed in to
// Abonten links the contact's own account, so alerts also reach them as an
// urgent push. Declining stops texts about this person; "stop all" stops
// every Abonten Safety text to the number, from anyone.

async function findContact(svc: ServiceRoleClient, token: string) {
  const { data, error } = await svc
    .from("safety_contact")
    .select("*")
    .eq("invite_token_hash", safetyTokenHash(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function blockedEveryone(svc: ServiceRoleClient, phone: string) {
  const { data } = await svc
    .from("safety_contact_optout")
    .select("id")
    .eq("phone_e164", phone)
    .is("user_id", null)
    .maybeSingle();
  return !!data;
}

export async function getSafetyInviteCore(
  svc: ServiceRoleClient,
  token: string,
  ip: string,
): Promise<SafetyEnvelope<SafetyInviteView>> {
  try {
    if (!(await checkRateLimit(`safety-invite:${ip}`, 60, 60))) {
      return safetyError(429, "tooManyRequests");
    }
    const contact = await findContact(svc, token);
    if (!contact) return safetyError(404, "linkInvalid");
    const person = await loadSafetyPerson(svc, contact.user_id);
    return {
      status: 200,
      data: {
        personName: person.name ?? "",
        contactName: contact.name,
        status: contact.status as SafetyContactStatus,
        blockedEveryone: await blockedEveryone(svc, contact.phone_e164),
      },
    };
  } catch (error) {
    logger.error(`getSafetyInviteCore: ${error}`);
    return safetyFail();
  }
}

export async function respondSafetyInviteCore(
  svc: ServiceRoleClient,
  token: string,
  response: SafetyInviteResponse,
  viewer: { userId: string | null; ip: string },
): Promise<SafetyEnvelope<SafetyInviteView>> {
  try {
    if (!(await checkRateLimit(`safety-invite:${viewer.ip}`, 60, 60))) {
      return safetyError(429, "tooManyRequests");
    }
    const contact = await findContact(svc, token);
    if (!contact) return safetyError(404, "linkInvalid");
    const now = new Date().toISOString();
    const previous = contact.status;

    if (response === "accept") {
      // Their own account is linked only when it is not the person's own.
      const link =
        viewer.userId && viewer.userId !== contact.user_id
          ? viewer.userId
          : null;
      const { error } = await svc
        .from("safety_contact")
        .update({
          status: "accepted",
          responded_at: now,
          ...(link ? { contact_user_id: link } : {}),
        })
        .eq("id", contact.id);
      if (error) throw new Error(error.message);
      // Accepting is the number's owner asking for these texts: it lifts a
      // "no" to this person and a "stop all" (the page says so first).
      await svc
        .from("safety_contact_optout")
        .delete()
        .eq("phone_e164", contact.phone_e164)
        .or(`user_id.eq.${contact.user_id},user_id.is.null`);
    } else {
      const { error } = await svc
        .from("safety_contact")
        .update({
          status: "declined",
          responded_at: now,
          contact_user_id: null,
        })
        .eq("id", contact.id);
      if (error) throw new Error(error.message);
      // Already recorded is fine (the unique index answers 23505).
      const { error: optoutError } = await svc
        .from("safety_contact_optout")
        .insert({
          phone_e164: contact.phone_e164,
          user_id: response === "block_all" ? null : contact.user_id,
        });
      if (optoutError && optoutError.code !== PG_UNIQUE_VIOLATION) {
        throw new Error(optoutError.message);
      }
    }

    const nextStatus = response === "accept" ? "accepted" : "declined";
    if (previous !== nextStatus) {
      await notifyPerson(svc, contact.user_id, {
        id:
          nextStatus === "accepted"
            ? "safety_contact_accepted"
            : "safety_contact_declined",
        params: { contact: contact.name },
      });
    }
    return getSafetyInviteCore(svc, token, viewer.ip);
  } catch (error) {
    logger.error(`respondSafetyInviteCore: ${error}`);
    return safetyFail();
  }
}
