import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Why this file exists. On 2026-09-19 a migration revoked EXECUTE on the
// three `expire_stale_*_checkouts` sweeps from `authenticated`, on the
// reasoning that a pg_cron job's function belongs to the scheduler. Fourteen
// call sites run those same sweeps on demand with the CALLER'S OWN session,
// as a self-heal before reading or validating a checkout, so the revoke
// broke the checkout read path in production for about fifty minutes until
// the integration suite caught it (money-path-lockdown, by accident).
//
// A grant is not visible in TypeScript and not visible in review: the only
// thing that fails is a live call with `42501 permission denied`. So both
// directions are asserted here against a real authenticated session:
//
//   1. functions the app invokes with the caller's session MUST stay
//      callable — a revoke is a production outage;
//   2. functions reserved for the service role MUST stay refused — an
//      accidental grant hands a signed-in user a privileged entry point.
//
// Neither list is generated: each entry is a deliberate statement about how
// that function is reached. Add a row when a new RPC is called with a
// session client, or when one is locked to the service role.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const PERMISSION_DENIED = "42501";
// PostgREST does not expose a function to a role that cannot execute it.
const NOT_EXPOSED = "PGRST202";

/** A throwaway uuid: these calls are about permission, not about results. */
const ABSENT_ID = "00000000-0000-4000-8000-0000000000ff";

type Call = { name: string; args?: Record<string, unknown>; why: string };

// Called with the caller's own session somewhere in @abonten/services or
// apps/web. Every one is either read-only or idempotent, so invoking them
// here is safe: the sweeps only touch rows already past their expiry.
const SESSION_CALLABLE: Call[] = [
  {
    name: "expire_stale_ticket_checkouts",
    why: "self-heal before reading/validating a ticket checkout (getTicketCheckoutCore, validateCheckoutCore, generateTicket, updateTicketCheckoutQuantity…)",
  },
  {
    name: "expire_stale_event_promotion_checkouts",
    why: "self-heal in getEventPromotionCheckout / activateEventPromotion",
  },
  {
    name: "expire_stale_place_promotion_checkouts",
    why: "self-heal in getPlacePromotionCheckout / activatePlacePromotion",
  },
  {
    name: "get_active_platform_fee_rate",
    why: "the service fee shown at checkout is read with the shopper's session",
  },
  {
    name: "get_unread_conversation_count",
    why: "the messages badge, read with the signed-in session",
  },
  {
    name: "get_my_credit_summary",
    why: "the Rewards screen reads the caller's own credit balance",
  },
  {
    name: "get_organizer_finance_overview",
    why: "the organizer finance page reads its own totals",
  },
  {
    name: "get_organizer_pending_earnings",
    why: "the organizer finance page reads its own pending earnings",
  },
  {
    name: "get_organizer_refund_breakdown",
    why: "the organizer finance page reads its own refunds",
  },
  {
    name: "get_event_attendance_counts",
    args: { p_event_ids: [ABSENT_ID] },
    why: "every event listing batches attendance counts with the viewer's session",
  },
  {
    name: "get_event_rating",
    args: { p_event_id: ABSENT_ID },
    why: "event pages read ratings with the viewer's session",
  },
  {
    name: "get_place_rating",
    args: { p_place_id: ABSENT_ID },
    why: "place pages read ratings with the viewer's session",
  },
  {
    name: "is_event_settled",
    args: { p_event_id: ABSENT_ID },
    why: "the organizer insights surface reads settlement with its own session",
  },
];

// Reserved for the service role. Arguments must match each signature
// exactly: PostgREST answers PGRST202 both for "this role cannot see the
// function" and for "no function with those arguments", so the test proves
// the signature is right by calling the same thing as the service role
// first. (create_ticket_checkout and issue_tickets_for_checkout are covered
// with real fixtures in money-path-lockdown, so they are not repeated here.)
const SERVICE_ROLE_ONLY: Call[] = [
  {
    name: "get_transaction_refundable_amount",
    args: { p_transaction_id: ABSENT_ID },
    why: "locked down 2026-09-18: it answered with an amount for any transaction id",
  },
  {
    name: "content_feed",
    args: {
      p_viewer: ABSENT_ID,
      p_surface: "spotlight",
      p_lat: 5.6,
      p_lng: -0.2,
      p_radius_km: 50,
      p_as_of: new Date().toISOString(),
      p_cursor_score: null,
      p_cursor_id: null,
      p_limit: 1,
    },
    why: "the Spotlight feed is assembled server-side with the service role",
  },
  {
    name: "content_story_tray",
    args: { p_viewer: ABSENT_ID },
    why: "the Stories tray is assembled server-side with the service role",
  },
  {
    name: "recommendations_for_user",
    args: { p_user: ABSENT_ID, p_limit: 1 },
    why: "recommendations are generated server-side, never read by a client",
  },
  {
    name: "referral_ensure_code",
    args: { p_user_id: ABSENT_ID },
    why: "a referral code is minted server-side after its own checks",
  },
  {
    name: "place_visit_record",
    args: {
      p_user_id: ABSENT_ID,
      p_place_id: ABSENT_ID,
      p_code: "000000",
      p_lat: 5.6,
      p_lng: -0.2,
      p_accuracy_m: 10,
      p_platform: "android",
      p_install_id: "integration-test",
      p_mocked: false,
    },
    why: "a place visit pays credit; the server verifies the rotating code and distance first",
  },
  {
    name: "weekly_edition_document",
    args: { p_edition_id: ABSENT_ID },
    why: "Abonten Weekly reads go through the programme check in @abonten/services",
  },
];

describe("database grants match how each function is actually reached", () => {
  let service: SupabaseClient<Database>;
  let user: TestUser;

  beforeAll(async () => {
    service = getServiceClient();
    user = await createTestUser(service);
  });

  afterAll(async () => {
    await deleteTestUser(service, user.id);
  });

  it.each(SESSION_CALLABLE)(
    "$name stays callable by a signed-in caller ($why)",
    async ({ name, args }) => {
      const { error } = await user.client.rpc(
        name as never,
        (args ?? {}) as never,
      );

      // A domain error ("not authorized for this event", a bad uuid, a null
      // result) is fine — this asserts only that the GRANT is intact.
      expect(
        error?.code,
        `${name} is no longer executable by "authenticated". A migration revoked it; the app calls it with the caller's own session, so this is a production outage. Restore the grant.`,
      ).not.toBe(PERMISSION_DENIED);
    },
  );

  it.each(SERVICE_ROLE_ONLY)(
    "$name stays refused for a signed-in caller ($why)",
    async ({ name, args }) => {
      // The service role reaches it with these exact arguments, so a
      // "not found" for the signed-in caller below can only mean the
      // function is invisible to that role — not that the call was malformed.
      const asService = await service.rpc(name as never, (args ?? {}) as never);
      expect(
        asService.error?.code,
        `${name}: the service role could not resolve this signature, so the arguments in this test are wrong — fix them, the grant is not being tested.`,
      ).not.toBe(NOT_EXPOSED);

      const { error } = await user.client.rpc(
        name as never,
        (args ?? {}) as never,
      );

      // Either shape is a refusal: Postgres denies EXECUTE (42501), or
      // PostgREST never exposes the function to a role that cannot execute
      // it (PGRST202).
      expect(
        error?.code,
        `${name} became reachable by "authenticated". A migration granted it, which hands a signed-in user a privileged entry point.`,
      ).toBeOneOf([PERMISSION_DENIED, NOT_EXPOSED]);
    },
  );
});
