// Production release check (docs/audit/09-incident-recovery-and-release-gate-2026-09-25.md
// runbook steps 3, 4, 7 and 9). Organizer / customer / admin flows plus
// direct Data API security probes against https://abontenhub.com and the
// production database, with throwaway @example.com accounts it creates and
// deletes (every row it writes is removed and checked). No payment is
// made. The admin checks sign in as the allowlisted Big_Ceo account with a
// session minted in memory and signed out afterwards. Prints outcomes
// only — never a key, token, e-mail address or phone number.
//
//   node scripts/release/production-smoke.mjs apps/web/.env.local
//
// Needs the production service-role key in that file: run it only from a
// trusted machine, and only when a production check is intended.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(
  new globalThis.URL("../../packages/services/package.json", import.meta.url),
);
const { createClient } = require("@supabase/supabase-js");
const env = Object.fromEntries(
  readFileSync(process.argv[2], "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const SITE = "https://abontenhub.com";
// `--expect-mode live|test`: fail unless production's Paystack keys are that mode.
const EXPECT_MODE = (() => {
  const i = process.argv.indexOf("--expect-mode");
  const m = i > 0 ? process.argv[i + 1] : null;
  return m === "live" || m === "test" ? m : null;
})();
const ADMIN = "https://admin.abontenhub.com";
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REF = new globalThis.URL(SUPABASE_URL).hostname.split(".")[0];
const service = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
const record = (area, step, ok, detail = "") => {
  results.push({ area, step, ok });
  console.log(
    `${ok ? "PASS" : "FAIL"}  [${area}] ${step}${detail ? `  — ${detail}` : ""}`,
  );
};
const created = { users: [], events: [], payout: [], drafts: [] };
const tag = `gate${Date.now().toString(36)}`;

async function throwaway(label) {
  const email = `gate-${label}-${Date.now()}@example.com`;
  const password = `Gate-${crypto.randomUUID()}-x1`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Gate ${label}` },
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  created.users.push(data.user.id);
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
  });
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (e2) throw new Error(`sign in ${label}: ${e2.message}`);
  const db = createClient(SUPABASE_URL, ANON, {
    global: { headers: { authorization: `Bearer ${s.session.access_token}` } },
    auth: { persistSession: false },
  });
  return { id: data.user.id, token: s.session.access_token, db };
}

async function api(path, token, body, method = "POST") {
  const res = await fetch(`${SITE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { http: res.status, json };
}

async function adminSession() {
  const { data: owner } = await service
    .from("user_info")
    .select("id")
    .eq("username", "Big_Ceo")
    .single();
  const { data: u } = await service.auth.admin.getUserById(owner.id);
  const { data: link } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: u.user.email,
  });
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
  });
  const { data: v, error } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (error) throw new Error(`admin session: ${error.message}`);
  const value = `base64-${Buffer.from(JSON.stringify(v.session)).toString("base64url")}`;
  const name = `sb-${REF}-auth-token`;
  const parts = [];
  for (let i = 0; i * 3180 < value.length; i++)
    parts.push(`${name}.${i}=${value.slice(i * 3180, (i + 1) * 3180)}`);
  return {
    cookie: value.length <= 3180 ? `${name}=${value}` : parts.join("; "),
    token: v.session.access_token,
  };
}
const pageText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

async function main() {
  const { data: flyer } = await service
    .from("event")
    .select("flyer_public_id, flyer_version")
    .not("flyer_public_id", "is", null)
    .limit(1)
    .single();
  const org = await throwaway("org");
  const buyer = await throwaway("buyer");
  const soon = new Date(Date.now() + 60 * 60_000);
  const later = new Date(Date.now() + 3 * 60 * 60_000);
  const base = {
    description:
      "Automated release check by Abonten engineering. Removed within minutes.",
    category: "Business & Networking",
    types: ["Conferences"],
    address: "Independence Avenue, Accra, Ghana",
    latitude: 5.5566,
    longitude: -0.1969,
    requireRegistration: false,
    flyerPublicId: flyer.flyer_public_id,
    flyerVersion: String(flyer.flyer_version),
    capacity: 20,
    startsAt: soon.toISOString(),
    endsAt: later.toISOString(),
  };
  const code = `GATE${Date.now().toString().slice(-6)}`;

  // ── Organizer ──────────────────────────────────────────────────────────
  const paid = await api("/api/mobile/events", org.token, {
    ...base,
    title: `Release check paid ${tag}`,
    clientRequestId: crypto.randomUUID(),
    singleTicket: { price: 1, quantity: 10 },
    promoCodes: [
      {
        promoCode: code,
        discount: 10,
        maximumUse: 5,
        expiryDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      },
    ],
  });
  const paidId = paid.json?.eventId;
  if (paidId) created.events.push(paidId);
  record(
    "organizer",
    "create paid event",
    paid.http === 200 && !!paidId,
    `HTTP ${paid.http}`,
  );

  const free = await api("/api/mobile/events", org.token, {
    ...base,
    title: `Release check free ${tag}`,
    clientRequestId: crypto.randomUUID(),
    freeEvent: true,
  });
  const freeId = free.json?.eventId;
  if (freeId) created.events.push(freeId);
  record(
    "organizer",
    "create free event",
    free.http === 200 && !!freeId,
    `HTTP ${free.http}`,
  );

  const draft = await api("/api/mobile/organizer/event-drafts", org.token, {
    payload: { title: `Release check draft ${tag}`, capacity: 20 },
  });
  const draftId = draft.json?.data?.draftId;
  if (draftId) created.drafts.push(draftId);
  const fromDraft = await api("/api/mobile/events", org.token, {
    ...base,
    title: `Release check draft ${tag}`,
    clientRequestId: crypto.randomUUID(),
    freeEvent: true,
    draftId,
  });
  if (fromDraft.json?.eventId) created.events.push(fromDraft.json.eventId);
  const { count: draftLeft } = await service
    .from("drafts")
    .select("id", { count: "exact", head: true })
    .eq("id", draftId ?? "00000000-0000-0000-0000-000000000000");
  record(
    "organizer",
    "save a draft, then publish it (draft removed)",
    draft.http === 200 && fromDraft.http === 200 && draftLeft === 0,
    `draft HTTP ${draft.http}, publish HTTP ${fromDraft.http}, draft rows left ${draftLeft}`,
  );

  if (paidId) {
    const edit = await api(
      `/api/mobile/organizer/events/${paidId}`,
      org.token,
      {
        title: `Release check paid ${tag} edited`,
        description: base.description,
        address: base.address,
        latitude: base.latitude,
        longitude: base.longitude,
        category: base.category,
        types: base.types,
        checked: false,
        capacity: 25,
        startsAt: base.startsAt,
        endsAt: base.endsAt,
      },
      "PATCH",
    );
    const { data: row } = await service
      .from("event")
      .select(
        "title, capacity, status, currency, country_code, timezone, organizer_id, featured",
      )
      .eq("id", paidId)
      .single();
    record(
      "organizer",
      "edit event",
      edit.http === 200 &&
        row?.capacity === 25 &&
        /edited$/i.test(row?.title ?? ""),
      `HTTP ${edit.http}, capacity ${row?.capacity}, title "${row?.title}"`,
    );
    record(
      "database",
      "event row: owner, market, currency, zone, status",
      row?.organizer_id === org.id &&
        row?.country_code === "GH" &&
        row?.currency === "GHS" &&
        row?.timezone === "Africa/Accra" &&
        row?.status === "published" &&
        row?.featured === false,
      `${row?.status} ${row?.country_code} ${row?.currency} ${row?.timezone} featured=${row?.featured}`,
    );
  }

  const dash = await api(
    "/api/mobile/organizer/dashboard?period=7d",
    org.token,
    null,
    "GET",
  );
  record(
    "organizer",
    "dashboard loads",
    dash.http === 200,
    `HTTP ${dash.http}`,
  );

  const payout = await api("/api/mobile/organizer/payout-accounts", org.token, {
    accountType: "mobile_money",
    accountHolderName: "Gate Check",
    networkCode: "MTN",
    networkName: "MTN",
    phone: "0240000000",
  });
  const { data: pa } = await service
    .from("payout_account")
    .select("id, currency, country_code")
    .eq("organizer_id", org.id);
  for (const p of pa ?? []) created.payout.push(p.id);
  record(
    "organizer",
    "add a payout account",
    payout.http === 200 && pa?.length === 1 && pa[0].currency === "GHS",
    `HTTP ${payout.http} ${payout.json?.message ?? ""}, rows ${pa?.length ?? 0} ${pa?.[0]?.currency ?? ""}`.trim(),
  );

  // ── Customer ───────────────────────────────────────────────────────────
  const anonDb = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
  });
  if (paidId) {
    const { data: near } = await anonDb.rpc("get_nearby_events", {
      user_lat: 5.5566,
      user_lng: -0.1969,
      search_radius: 5000,
      p_cursor_sort_key: null,
      p_cursor_id: null,
      p_page_size: 50,
    });
    record(
      "customer",
      "event appears in signed-out discovery",
      (near ?? []).some((e) => e.id === paidId),
    );
    const t0 = Date.now();
    const { data: hits, error: searchError } = await anonDb.rpc(
      "search_events",
      { p_query: tag },
    );
    record(
      "customer",
      "signed-out search finds the event",
      !searchError && (hits ?? []).some((e) => e.id === paidId),
      searchError?.message ??
        `${hits?.length ?? 0} hit(s), ${Date.now() - t0} ms`,
    );
  }
  const { data: anyPlace } = await service
    .from("place")
    .select("id")
    .eq("status", "published")
    .limit(1)
    .maybeSingle();
  if (anyPlace) {
    const { data: open, error: openError } = await anonDb.rpc(
      "place_is_open_now",
      { p_place_id: anyPlace.id },
    );
    record(
      "customer",
      "signed-out open-now check on a place",
      !openError && typeof open === "boolean",
      openError?.message ?? `answered ${open}`,
    );
  }
  if (paidId) {
    const { data: ev } = await service
      .from("event")
      .select("event_code")
      .eq("id", paidId)
      .single();
    const page = await fetch(`${SITE}/events/${ev.event_code}`);
    const text = pageText(await page.text());
    record(
      "customer",
      "event page opens and shows the ticket price",
      page.status === 200 &&
        text.toLowerCase().includes(tag) &&
        /GH₵s?(1|0.9)/.test(text),
      `HTTP ${page.status}; title ${text.toLowerCase().includes(tag)}; prices ${(text.match(/GH₵s?[0-9.,]+/g) ?? []).slice(0, 3).join(", ") || "none"}`,
    );
    const { data: tt } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", paidId)
      .single();
    const v = await api("/api/mobile/checkout/validate", buyer.token, {
      eventId: paidId,
      quantities: { [tt.id]: 1 },
      promoCode: code,
    });
    const { data: co } = await service
      .from("ticket_checkout")
      .select("discount, total_price, status")
      .eq("event_id", paidId)
      .eq("user_id", buyer.id);
    record(
      "customer",
      "reserve a ticket with the promo code (no payment)",
      v.http === 200 && Number(co?.[0]?.discount) > 0,
      `HTTP ${v.http}, total ${co?.[0]?.total_price} GHS`,
    );
    if (v.json?.checkoutSessionId) {
      // Start a card payment: the server asks Paystack for a checkout page
      // and nothing is charged (nobody pays it; the reservation is cancelled
      // next). Its public key and reference tell which Paystack mode the
      // server runs — printed as "test"/"live", never the key.
      const start = await api("/api/mobile/checkout/attempt", buyer.token, {
        checkoutSessionIds: [v.json.checkoutSessionId],
        method: "card",
      });
      const payment = start.json?.data?.payment ?? start.json?.payment ?? null;
      const pkMode = /^pk_live_/.test(payment?.publicKey ?? "")
        ? "live"
        : /^pk_test_/.test(payment?.publicKey ?? "")
          ? "test"
          : "none";
      let secretMode = "unknown";
      if (
        payment?.reference &&
        /^sk_test_/.test(env.PAYSTACK_SECRET_KEY ?? "")
      ) {
        // Found on the TEST account = production's secret key is the test key.
        const r = await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(payment.reference)}`,
          { headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } },
        );
        secretMode = r.status === 200 ? "test" : "not test";
      }
      const hosted = /^https:\/\/checkout\.paystack\.com\//.test(
        payment?.authorizationUrl ?? "",
      );
      const modeOk =
        !EXPECT_MODE ||
        (pkMode === EXPECT_MODE &&
          (EXPECT_MODE === "live"
            ? secretMode === "not test"
            : secretMode === "test"));
      record(
        "customer",
        "start a card payment (Paystack checkout page opened, nothing charged)",
        start.http === 200 && hosted && modeOk,
        `HTTP ${start.http}; hosted page ${hosted}; public key ${pkMode}; secret key ${secretMode}${EXPECT_MODE ? `; expected ${EXPECT_MODE}` : ""}`,
      );
      // The attempt the server recorded: provider, market, currency and the
      // charge it asked Paystack for — all decided server-side.
      const { data: att } = await service
        .from("payment_attempt")
        .select(
          "id, provider, country_code, currency, amount, provider_reference, metadata, status",
        )
        .eq("user_id", buyer.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const total = Number(co?.[0]?.total_price ?? 0);
      const chargeMinor = Number(att?.metadata?.charge_minor ?? -1);
      record(
        "customer",
        "the recorded attempt carries the server's market, currency and charge",
        !!att &&
          att.provider === "paystack" &&
          att.country_code === "GH" &&
          att.currency === "GHS" &&
          att.metadata?.charge_currency === "GHS" &&
          att.metadata?.mode === "popup" &&
          /^PSK-/.test(att.provider_reference ?? "") &&
          Number(att.amount) > total &&
          chargeMinor === Math.round(Number(att.amount) * 100) &&
          att.provider_reference === payment?.reference,
        att
          ? `${att.provider}/${att.country_code} ${att.amount} ${att.currency} (order ${total}; charge ${chargeMinor} minor; reference matches ${att.provider_reference === payment?.reference})`
          : "no attempt row",
      );

      // With a payment open the order cannot be cancelled (it might still be
      // paid).
      const early = await api("/api/mobile/checkout/cancel", buyer.token, {
        checkoutSessionId: v.json.checkoutSessionId,
      });
      record(
        "customer",
        "cancel refused while the payment is open",
        early.http === 409,
        `HTTP ${early.http}`,
      );

      // The verify path, end to end: the server asks Paystack about the
      // unpaid reference with its configured key. Paystack answers
      // "abandoned" (nobody paid) and the attempt must close as failed —
      // the same code a returning buyer runs, and proof the key that
      // started the charge can also verify it. Anything else (202
      // "pending") means the server could not read Paystack's answer.
      const ver = att
        ? await api("/api/mobile/payments/verify", buyer.token, {
            paymentAttemptId: att.id,
          })
        : { http: 0, json: null };
      const { data: attAfter } = att
        ? await service
            .from("payment_attempt")
            .select("status, failure_reason")
            .eq("id", att.id)
            .maybeSingle()
        : { data: null };
      const finalized = ver.json?.data?.finalized ?? ver.json?.finalized;
      record(
        "customer",
        "verify reaches Paystack for the unpaid charge (nothing to fulfil)",
        ver.http === 400 &&
          finalized === "failed" &&
          attAfter?.status === "failed",
        `HTTP ${ver.http}; finalized ${finalized ?? "-"}; attempt ${attAfter?.status ?? "-"}${attAfter?.failure_reason ? ` (${attAfter.failure_reason})` : ""}`,
      );

      // Closed by verify: the reservation can now be cancelled and its
      // ticket goes back on sale.
      const c = await api("/api/mobile/checkout/cancel", buyer.token, {
        checkoutSessionId: v.json.checkoutSessionId,
      });
      record(
        "customer",
        "cancel the reservation once its payment is closed",
        c.http === 200,
        `HTTP ${c.http}`,
      );
    }
  }

  // ── Payment configuration (production's own report; no charge) ───────
  // The health check runs every 2 minutes on the web deployment and records
  // the mode of each key (never the key), the declared PAYMENTS_MODE and
  // charged payments nothing has settled.
  const { data: health } = await service
    .from("health_check_result")
    .select("ok, detail, checked_at")
    .eq("check_key", "paystack")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const modes = health?.detail?.modes?.GH ?? {};
  const fresh =
    !!health &&
    Date.now() - new Date(health.checked_at).getTime() < 10 * 60_000;
  // Live must be declared (PAYMENTS_MODE=live); before the switch, test keys
  // with no declared mode is the expected state.
  const declared = health?.detail?.declaredMode ?? null;
  const modesOk =
    !EXPECT_MODE ||
    (["secretKey", "publicKey", "webhookSecret"].every(
      (k) => modes[k] === EXPECT_MODE,
    ) &&
      (declared === EXPECT_MODE ||
        (EXPECT_MODE === "test" && declared === null)));
  record(
    "payments",
    "health check: keys, declared mode and unsettled charges",
    fresh &&
      health?.ok === true &&
      health?.detail?.deployment === "production" &&
      Number(health?.detail?.unsettledPayments ?? 1) === 0 &&
      modesOk,
    health
      ? `${Math.round((Date.now() - new Date(health.checked_at).getTime()) / 60_000)} min ago; ok ${health.ok}; secret ${modes.secretKey}, public ${modes.publicKey}, webhook ${modes.webhookSecret}; declared ${health.detail?.declaredMode ?? "none"}; deployment ${health.detail?.deployment}; unsettled ${health.detail?.unsettledPayments}${EXPECT_MODE ? `; expected ${EXPECT_MODE}` : ""}`
      : "no health row",
  );

  // The webhook endpoints are up and refuse anything unsigned or
  // mis-signed (both answer before touching any record).
  for (const path of [
    "/api/paystack/webhook",
    "/api/payments/webhook/paystack/GH",
  ]) {
    const unsigned = await fetch(`${SITE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "charge.success",
        data: { reference: "PSK-none" },
      }),
    });
    const unsignedBody = await unsigned.json().catch(() => ({}));
    const missigned = await fetch(`${SITE}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-paystack-signature": "00",
      },
      body: JSON.stringify({
        event: "charge.success",
        data: { reference: "PSK-none" },
      }),
    });
    const missignedBody = await missigned.json().catch(() => ({}));
    record(
      "payments",
      `webhook ${path} refuses unsigned and mis-signed events`,
      unsigned.status === 401 &&
        unsignedBody.error === "missing_signature" &&
        missigned.status === 401 &&
        missignedBody.error === "invalid_signature",
      `unsigned ${unsigned.status} ${unsignedBody.error ?? ""}; mis-signed ${missigned.status} ${missignedBody.error ?? ""}`,
    );
  }

  // The reconcile sweep is wired to this site and its route needs the token.
  const { data: rc } = await service
    .from("payment_reconcile_config")
    .select("dispatch_url, token, last_dispatched_at")
    .eq("id", true)
    .maybeSingle();
  const rcProbe = await fetch(`${SITE}/api/maintenance/payment-reconcile`, {
    method: "POST",
  });
  record(
    "payments",
    "payment-reconcile sweep points here and its route is token-protected",
    rc?.dispatch_url === `${SITE}/api/maintenance/payment-reconcile` &&
      (rc?.token?.length ?? 0) >= 32 &&
      rcProbe.status === 401,
    `url ${rc?.dispatch_url === `${SITE}/api/maintenance/payment-reconcile` ? "ok" : "WRONG"}; token set ${(rc?.token?.length ?? 0) >= 32}; unauthenticated ${rcProbe.status}; last dispatched ${rc?.last_dispatched_at ?? "never"}`,
  );
  let ticketId = null;
  if (freeId) {
    const r = await api("/api/mobile/checkout/free-rsvp", buyer.token, {
      eventId: freeId,
    });
    const { data: types } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", freeId);
    const { data: t } = await service
      .from("ticket")
      .select("id, status")
      .eq("user_id", buyer.id)
      .in(
        "ticket_type_id",
        (types ?? []).map((x) => x.id),
      )
      .maybeSingle();
    ticketId = t?.id ?? null;
    record(
      "customer",
      "register for the free event",
      r.http === 200 && t?.status === "active",
      `HTTP ${r.http}`,
    );
  }

  // ── Admin ──────────────────────────────────────────────────────────────
  if (paidId) {
    const admin = await adminSession();
    try {
      const list = await fetch(`${ADMIN}/events?q=${encodeURIComponent(tag)}`, {
        headers: { cookie: admin.cookie },
        redirect: "manual",
      });
      const listText = pageText(await list.text());
      record(
        "admin",
        "find the event in Admin › Events",
        list.status === 200 && listText.toLowerCase().includes(tag),
        `HTTP ${list.status}; snippet "${listText.slice(listText.lastIndexOf("Sign out") + 8, listText.lastIndexOf("Sign out") + 300)}"`,
      );
      const detail = await fetch(`${ADMIN}/events/${paidId}`, {
        headers: { cookie: admin.cookie },
        redirect: "manual",
      });
      const dText = pageText(await detail.text());
      record(
        "admin",
        "event detail shows organizer, market, currency and status",
        detail.status === 200 &&
          dText.toLowerCase().includes(tag) &&
          /GH₵|GHS/.test(dText) &&
          /published/i.test(dText) &&
          /Ghana \(GH\)/.test(dText),
        `HTTP ${detail.status}; title ${dText.toLowerCase().includes(tag)}, money ${/GH₵|GHS/.test(dText)}, published ${/published/i.test(dText)}, Ghana ${/Ghana \(GH\)/.test(dText)}`,
      );
    } finally {
      await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { apikey: ANON, authorization: `Bearer ${admin.token}` },
      });
    }
  }

  // ── Security probes (Data API, as the organizer / buyer) ──────────────
  // Push tokens (migration 20260925111600). The rows go with the account.
  const bad = await org.db.from("device_token").insert({
    user_id: org.id,
    token: "not-a-push-token",
    platform: "android",
  });
  for (let i = 0; i < 12; i++) {
    await org.db.from("device_token").insert({
      user_id: org.id,
      token: `ExponentPushToken[${tag}x${i}]`,
      platform: "android",
    });
  }
  const { count: kept } = await service
    .from("device_token")
    .select("id", { count: "exact", head: true })
    .eq("user_id", org.id);
  record(
    "security",
    "a malformed push token is refused; an account keeps at most 10",
    bad.error?.code === "23514" && kept === 10,
    `${bad.error?.code ?? "accepted"}, ${kept} kept of 12`,
  );

  if (paidId) {
    for (const [field, value] of [
      ["currency", "USD"],
      ["country_code", "NG"],
      ["featured", true],
      ["timezone", "Africa/Lagos"],
    ]) {
      const { error } = await org.db
        .from("event")
        .update({ [field]: value })
        .eq("id", paidId);
      const { data: row } = await service
        .from("event")
        .select(field)
        .eq("id", paidId)
        .single();
      record(
        "security",
        `organizer cannot change event.${field} directly`,
        !!error && row[field] !== value,
        error?.code ?? "no error",
      );
    }
    const { data: tt } = await service
      .from("ticket_type")
      .select("id, quantity")
      .eq("event_id", paidId)
      .single();
    const { error: capErr } = await org.db
      .from("ticket_type")
      .update({ quantity: 500 })
      .eq("id", tt.id);
    const { data: tt2 } = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", tt.id)
      .single();
    record(
      "security",
      "organizer cannot raise ticket quantity past capacity",
      !!capErr && tt2.quantity === tt.quantity,
      capErr?.code ?? "no error",
    );
    const { error: attErr } = await buyer.db.from("attendance").insert({
      user_id: buyer.id,
      event_id: paidId,
      number_of_tickets: 25,
      status: "attending",
    });
    record(
      "security",
      "no one can insert attendance to fill an event",
      !!attErr,
      attErr?.code ?? "inserted!",
    );
    const { data: codes } = await buyer.db
      .from("promo_code")
      .select("promo_code")
      .eq("event_id", paidId);
    record(
      "security",
      "buyer cannot list promo codes",
      (codes ?? []).length === 0,
      `${(codes ?? []).length} visible`,
    );
  }
  const ce = await org.db.rpc("create_event", {
    p_client_request_id: crypto.randomUUID(),
    p_organizer_id: org.id,
  });
  record(
    "security",
    "direct create_event is refused",
    !!ce.error && /42501|PGRST202/.test(ce.error.code ?? ""),
    ce.error?.code,
  );
  const cp = await org.db.rpc("create_place", {
    p_client_request_id: crypto.randomUUID(),
    p_owner_id: org.id,
  });
  record(
    "security",
    "direct create_place is refused",
    !!cp.error && /42501|PGRST202/.test(cp.error.code ?? ""),
    cp.error?.code,
  );
  const { error: paErr } = await org.db.from("payout_account").insert({
    organizer_id: org.id,
    account_type: "bank",
    account_holder_name: "X",
    provider: "x",
    account_number: "123456789",
    currency: "NGN",
    country_code: "NG",
  });
  record(
    "security",
    "payout accounts cannot be written directly",
    !!paErr,
    paErr?.code ?? "inserted!",
  );
  if (ticketId) {
    const { error: moveErr } = await org.db
      .from("ticket")
      .update({ user_id: org.id })
      .eq("id", ticketId);
    const { data: t } = await service
      .from("ticket")
      .select("user_id")
      .eq("id", ticketId)
      .single();
    record(
      "security",
      "organizer cannot move a buyer's ticket to another account",
      t.user_id === buyer.id,
      moveErr?.code ?? "no error, row unchanged",
    );
    const cancel = await api("/api/mobile/tickets/cancel", buyer.token, {
      ticketId,
    });
    const { error: reviveErr } = await org.db
      .from("ticket")
      .update({ status: "active" })
      .eq("id", ticketId);
    const { data: t2 } = await service
      .from("ticket")
      .select("status")
      .eq("id", ticketId)
      .single();
    record(
      "security",
      "organizer cannot restore a cancelled ticket",
      cancel.http === 200 && t2.status !== "active",
      `cancel HTTP ${cancel.http}, ticket ${t2.status}, ${reviveErr?.code ?? "no error"}`,
    );
  }
  // Banned organizer and attendee PII.
  await service.from("user_info").update({ status_id: 3 }).eq("id", org.id);
  const pii = await org.db.rpc("get_event_attendee_contacts", {
    p_event_id: freeId,
  });
  record(
    "security",
    "a banned organizer's token cannot read attendee contacts",
    !!pii.error,
    pii.error?.code ?? `${pii.data?.length} rows`,
  );
  const bannedApi = await api(
    "/api/mobile/organizer/dashboard?period=7d",
    org.token,
    null,
    "GET",
  );
  record(
    "security",
    "a banned organizer's token is refused by the mobile API",
    bannedApi.http === 403 || bannedApi.http === 401,
    `HTTP ${bannedApi.http}`,
  );

  // Service-role key never reaches the browser.
  const home = await (await fetch(`${SITE}/`)).text();
  const scripts = [...home.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(
    (m) => m[1],
  );
  let leaked = 0;
  const needles = [
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.PAYSTACK_SECRET_KEY,
    env.CLOUDINARY_API_SECRET,
  ].filter(Boolean); // real values only; supabase-js contains the literal prefix "sb_secret_"
  for (const s of scripts) {
    const js = await (await fetch(`${SITE}${s}`)).text();
    if (needles.some((n) => js.includes(n))) leaked++;
  }
  record(
    "security",
    `no secret key in the ${scripts.length} browser scripts of the home page`,
    leaked === 0 && scripts.length > 0,
    `${leaked} script(s) matched`,
  );
}

async function cleanup() {
  for (const id of created.events) {
    await service.from("ticket_checkout").delete().eq("event_id", id);
    const { data: tts } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", id);
    const { data: tickets } = await service
      .from("ticket")
      .select("id")
      .in(
        "ticket_type_id",
        (tts ?? []).map((t) => t.id),
      );
    const ids = (tickets ?? []).map((t) => t.id);
    if (ids.length) {
      await service.from("attendance").delete().in("ticket_id", ids);
      await service.from("ticket").delete().in("id", ids);
    }
    await service.from("attendance").delete().eq("event_id", id);
    await service.from("promo_code").delete().eq("event_id", id);
    const { error } = await service.from("event").delete().eq("id", id);
    if (error) console.log(`cleanup: event not deleted: ${error.message}`);
  }
  for (const id of created.payout)
    await service.from("payout_account").delete().eq("id", id);
  for (const id of created.drafts)
    await service.from("drafts").delete().eq("id", id);
  for (const id of created.users) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) console.log(`cleanup: user not deleted: ${error.message}`);
  }
  const left = [];
  for (const id of created.events) {
    const { count } = await service
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("id", id);
    if (count) left.push(`event ${id}`);
  }
  for (const id of created.users) {
    const { count } = await service
      .from("user_info")
      .select("id", { count: "exact", head: true })
      .eq("id", id);
    if (count) left.push(`user_info ${id}`);
  }
  console.log(
    left.length
      ? `CLEANUP LEFT: ${left.join(", ")}`
      : "cleanup: every test row removed",
  );
}

try {
  await main();
} catch (e) {
  record("script", "run", false, String(e.message ?? e));
} finally {
  await cleanup();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`— ${results.length - failed} passed, ${failed} failed —`);
}
