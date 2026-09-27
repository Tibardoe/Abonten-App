#!/usr/bin/env node
// Seeds the disposable local Supabase stack (started by
// setup-local-test-db.mjs) with the public catalogue the web browser suite
// (apps/web/e2e) needs: one organizer, one published upcoming event with a
// ticket type, and one published place.
//
// Without it the event and place page checks (Open Graph tags, JSON-LD,
// the reviews pages, the accessibility scan of a live listing) had nothing
// to open and skipped themselves. CI ran them against the production
// database with a key that was disabled on 2026-09-04, so from then on they
// never ran at all while the job stayed green.
//
// The event goes through the real create_event RPC, like the integration
// suite's fixtures, so the page renders a row shaped exactly like one an
// organizer creates. Run before `next build`: the sitemap the tests read is
// prerendered at build time.
//
// Usage: node scripts/test-db/seed-e2e.mjs   (after npm run test:db:up)

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ENV_FILE = join(ROOT, ".env.test.local");

function readTestEnv() {
  let contents;
  try {
    contents = readFileSync(ENV_FILE, "utf8");
  } catch {
    throw new Error(
      "[e2e-seed] .env.test.local not found. Run `npm run test:db:up` first.",
    );
  }
  const env = Object.fromEntries(
    contents
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [
        line.slice(0, line.indexOf("=")),
        line.slice(line.indexOf("=") + 1),
      ]),
  );
  const url = env.SUPABASE_TEST_URL;
  const serviceKey = env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "[e2e-seed] .env.test.local is missing the URL or service key.",
    );
  }
  // The seed writes as the service role; refuse anything but a local stack
  // so it can never add test listings to a real database.
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `[e2e-seed] refusing to seed a non-local database (${host}).`,
    );
  }
  return { url, serviceKey };
}

// Accra, the default market's centre.
const LAT = 5.6037;
const LNG = -0.187;
const HOUR = 3_600_000;

async function main() {
  const { url, serviceKey } = readTestEnv();
  const svc = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: created, error: userError } = await svc.auth.admin.createUser({
    email: `e2e-organizer-${Date.now()}@example.test`,
    password: `e2e-${randomUUID()}`,
    email_confirm: true,
    user_metadata: { full_name: "Accra Live Collective" },
  });
  if (userError || !created.user) {
    throw new Error(`[e2e-seed] organizer: ${userError?.message}`);
  }
  const organizerId = created.user.id;

  const startsAt = new Date(Date.now() + 7 * 24 * HOUR);
  const { data: eventId, error: eventError } = await svc.rpc("create_event", {
    p_client_request_id: randomUUID(),
    p_organizer_id: organizerId,
    p_title: "Highlife Night at the Arts Centre",
    p_slug: `highlife-night-${randomUUID()}`,
    p_description:
      "An evening of live highlife and palm-wine music with a full band.",
    p_event_code: randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
    p_event_category: "Arts, Culture & Theatre",
    p_event_type: ["Live Concerts"],
    p_latitude: LAT,
    p_longitude: LNG,
    p_address: { full_address: "Centre for National Culture, Accra, Ghana" },
    p_capacity: 200,
    p_website_url: null,
    p_flyer_public_id: "e2e/flyer",
    p_flyer_version: "1",
    p_starts_at: startsAt.toISOString(),
    p_ends_at: new Date(startsAt.getTime() + 4 * HOUR).toISOString(),
    p_require_registration: false,
    p_featured: false,
    p_specific_dates: null,
    p_ticket_types: [
      {
        type: "General",
        price: 50,
        currency: "GHS",
        quantity: 150,
        available_from: null,
        available_until: null,
      },
    ],
    p_promo_codes: null,
    p_receiving_account: null,
    p_place_id: null,
  });
  if (eventError || !eventId) {
    throw new Error(`[e2e-seed] create_event: ${eventError?.message}`);
  }
  const { error: publishError } = await svc
    .from("event")
    .update({
      status: "published",
      published_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    })
    .eq("id", eventId);
  if (publishError) {
    throw new Error(`[e2e-seed] publish event: ${publishError.message}`);
  }

  const { data: category, error: categoryError } = await svc
    .from("place_category")
    .select("id")
    .order("id")
    .limit(1)
    .single();
  if (categoryError || !category) {
    throw new Error(`[e2e-seed] place category: ${categoryError?.message}`);
  }
  const { error: placeError } = await svc.from("place").insert({
    country_code: "GH",
    timezone: "Africa/Accra",
    owner_id: organizerId,
    name: "Osu Courtyard Kitchen",
    slug: `osu-courtyard-kitchen-${randomUUID().slice(0, 8)}`,
    description: "A courtyard restaurant with live music on weekends.",
    category_id: category.id,
    location: `SRID=4326;POINT(${LNG} ${LAT})`,
    address: { full_address: "Oxford Street, Osu, Accra, Ghana" },
    cover_public_id: "e2e/cover",
    cover_version: "1",
    status: "published",
    published_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  });
  if (placeError) {
    throw new Error(`[e2e-seed] place: ${placeError.message}`);
  }

  console.log(
    "[e2e-seed] Seeded one organizer, one published event and one published place.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
