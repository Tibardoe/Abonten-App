import type { Database } from "@abonten/types/database.types";
// Shared helpers for the integration suite in this directory. Requires a
// local Supabase stack started via `npm run test:db:up` at the repo root
// (see scripts/test-db/setup-local-test-db.mjs) -- these tests hit a real
// local Postgres over HTTP, not a mock.
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Run "npm run test:db:up" at the repo root first, then re-run with "npm run test:integration -w @abonten/services".`,
    );
  }
  return value;
}

export function getServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requiredEnv("SUPABASE_TEST_URL"),
    requiredEnv("SUPABASE_TEST_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

// A test user, signed in as themselves -- i.e. a client whose requests carry
// their JWT, so RLS and auth.uid() see them as a real authenticated caller
// rather than the service role.
export type TestUser = {
  id: string;
  email: string;
  client: SupabaseClient<Database>;
};

let userCounter = 0;

export async function createTestUser(
  service: SupabaseClient<Database>,
): Promise<TestUser> {
  userCounter += 1;
  const email = `integration-test-${Date.now()}-${userCounter}@example.test`;
  const password = "test-password-not-real-12345";

  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createError || !created.user) {
    throw new Error(`Failed to create test user: ${createError?.message}`);
  }

  const anon = createClient<Database>(
    requiredEnv("SUPABASE_TEST_URL"),
    requiredEnv("SUPABASE_TEST_ANON_KEY"),
    {
      auth: { persistSession: false },
    },
  );
  const { data: signedIn, error: signInError } =
    await anon.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  const client = createClient<Database>(
    requiredEnv("SUPABASE_TEST_URL"),
    requiredEnv("SUPABASE_TEST_ANON_KEY"),
    {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      },
    },
  );

  return { id: created.user.id, email, client };
}

export async function deleteTestUser(
  service: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  await service.auth.admin.deleteUser(userId);
}

// Minimal event + one ticket_type, created through the real create_event RPC
// (not a hand-rolled insert) so fixtures exercise the same write path
// production traffic does, including PostGIS location encoding.
export type TestEventFixture = {
  eventId: string;
  ticketTypeId: string;
};

export async function createTestEventWithTicketType(
  service: SupabaseClient<Database>,
  organizerId: string,
  options: { quantity: number; price?: number },
): Promise<TestEventFixture> {
  const price = options.price ?? 50;
  const { data: eventId, error } = await service.rpc("create_event", {
    p_client_request_id: crypto.randomUUID(),
    p_organizer_id: organizerId,
    p_title: "Integration Test Event",
    p_slug: `integration-test-event-${crypto.randomUUID()}`,
    p_description: "Created by the integration test suite.",
    p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
    p_event_category: "conference",
    p_event_type: ["Live Concerts"],
    p_latitude: 5.6037,
    p_longitude: -0.187,
    p_address: { city: "Accra", country: "Ghana" },
    p_capacity: 100,
    p_website_url: null,
    p_flyer_public_id: "test/flyer",
    p_flyer_version: "1",
    p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    p_ends_at: new Date(Date.now() + 90_000_000).toISOString(),
    p_require_registration: false,
    p_featured: false,
    p_specific_dates: null,
    p_ticket_types: [
      {
        type: "General",
        price,
        currency: "GHS",
        quantity: options.quantity,
        available_from: null,
        available_until: null,
      },
    ],
    p_promo_codes: null,
    p_receiving_account: null,
    p_place_id: null,
    // Same generated-type gap validateCheckoutCore.ts documents: these SQL
    // params have no DEFAULT even though the function body treats them as
    // optional, so the generated Args type wrongly marks them required.
  } as unknown as Database["public"]["Functions"]["create_event"]["Args"]);
  if (error || !eventId) {
    throw new Error(`Failed to create test event: ${error?.message}`);
  }

  const { data: ticketTypes, error: ticketTypeError } = await service
    .from("ticket_type")
    .select("id")
    .eq("event_id", eventId);
  if (ticketTypeError || !ticketTypes || ticketTypes.length === 0) {
    throw new Error(
      `Failed to look up ticket_type for test event: ${ticketTypeError?.message}`,
    );
  }

  return { eventId, ticketTypeId: ticketTypes[0].id };
}

export async function deleteTestEvent(
  service: SupabaseClient<Database>,
  eventId: string,
): Promise<void> {
  await service.from("event").delete().eq("id", eventId);
}
