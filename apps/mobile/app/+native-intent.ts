import { captureInvite } from "@/features/rewards/inviteCapture";
import { captureReferral } from "@/features/rewards/referralCapture";
import { supabase } from "@/lib/supabase";

// Translates an incoming Universal / App Link (https://abontenhub.com/...)
// into the matching in-app route. The native detail screens are keyed by
// id, but shared web links carry an event *code* / place *slug*, so this
// resolves them to an id first (a cheap anon read — RLS-safe). Anything it
// can't resolve falls through to the tabs rather than a broken screen.
//
// expo-router calls this for every deep link; the `abonten://` custom-scheme
// links (checkout / promotion / notification push) already match app routes
// and are passed straight through.

async function resolveEvent(seg: string): Promise<string | null> {
  const { data } = await supabase
    .from("event")
    .select("id")
    .ilike("event_code", seg)
    .maybeSingle();
  return data?.id ?? null;
}

async function resolvePlace(seg: string): Promise<string | null> {
  const { data } = await supabase
    .from("place")
    .select("id")
    .eq("slug", seg)
    .maybeSingle();
  return data?.id ?? null;
}

export async function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): Promise<string> {
  // The launch link is resolved while expo-router's NavigationContainer is
  // still rendering for the first time (Android always hands it over as a
  // promise). If this resolves within the same task, the router records the
  // link with a state update on a container that has not mounted yet —
  // React's dev-only "Can't perform a React state update on a component
  // that hasn't mounted yet" at every launch. One macrotask lets the
  // container commit first; the launch itself is not measurably slower.
  if (initial) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  try {
    const url = new URL(
      path,
      path.startsWith("http") ? undefined : "https://abontenhub.com",
    );
    // abonten://invite/CODE parses "invite" as the host.
    const parts = [
      ...(url.protocol === "abonten:" && url.host ? [url.host] : []),
      ...url.pathname.split("/").filter(Boolean),
    ];
    // A shared link can carry the sharer's referral code (?ref=). Remembered
    // for this event's checkout; never delays the navigation.
    const ref = url.searchParams.get("ref");

    // A friend's invite (abontenhub.com/invite/CODE): kept on the device
    // until the person is signed in, then applied (useInviteBinding).
    if (parts[0] === "invite" && parts[1]) {
      const code = await captureInvite(decodeURIComponent(parts[1]), "link");
      return code ? `/(app)/invite/${code}` : "/(app)/(tabs)";
    }
    if (parts[0] === "events" && parts[1]) {
      const id = await resolveEvent(decodeURIComponent(parts[1]));
      if (id && ref) void captureReferral(ref, { eventId: id });
      return id ? `/(app)/event/${id}` : "/(app)/(tabs)";
    }
    if (parts[0] === "places" && parts[1]) {
      const id = await resolvePlace(decodeURIComponent(parts[1]));
      if (id && ref) void captureReferral(ref, { placeId: id });
      // A place's check-in QR code (?visit=CODE): the place screen offers
      // to check in.
      const visit = url.searchParams.get("visit");
      if (id && visit && /^[0-9A-Fa-f]{10}$/.test(visit)) {
        return `/(app)/place/${id}?visit=${visit.toUpperCase()}`;
      }
      return id ? `/(app)/place/${id}` : "/(app)/(tabs)";
    }
    // Abonten Weekly: /weekly (this week, Ghana or the explored area),
    // /weekly/<area> (this week for that area) and /weekly/<area>/<monday>.
    // The segments are validated by the API; nothing is looked up here.
    if (parts[0] === "weekly") {
      const area = parts[1] ? decodeURIComponent(parts[1]) : null;
      const week = parts[2] ? decodeURIComponent(parts[2]) : null;
      const slug = /^[a-z0-9-]{1,40}$/;
      if (area && week && slug.test(area) && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
        return `/(app)/weekly/${area}/${week}`;
      }
      if (area && slug.test(area) && area !== "preview") {
        return `/(app)/weekly?scope=${area}`;
      }
      return "/(app)/weekly";
    }
    // Spotlight and Stories: /spotlight, /spotlight/<post id>, /stories/<post id>,
    // plus the creator screens the app itself links to (promotion payment
    // returns, notifications): spotlight/campaign/<id>, spotlight/post/<id>,
    // spotlight/promote/<post id>, spotlight/manage. Ids are checked by shape
    // only; the screens ask the API, which applies the programme switch,
    // ownership, moderation and blocks.
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (parts[0] === "spotlight") {
      const first = parts[1] ? decodeURIComponent(parts[1]) : null;
      const second = parts[2] ? decodeURIComponent(parts[2]) : null;
      if (first === "manage") return "/(app)/spotlight/manage";
      if (
        (first === "campaign" || first === "post" || first === "promote") &&
        second &&
        uuid.test(second)
      ) {
        return `/(app)/spotlight/${first}/${second}`;
      }
      return first && uuid.test(first)
        ? `/(app)/spotlight/${first}`
        : "/(app)/(tabs)/spotlight";
    }
    if (parts[0] === "stories" && parts[1]) {
      const id = decodeURIComponent(parts[1]);
      return uuid.test(id) ? `/(app)/story/${id}` : "/(app)/(tabs)/messages";
    }
    // Conversation deep links (notification tap / cross-device). The segment
    // is already a conversation id — no lookup needed; RLS gates the screen.
    if (parts[0] === "messages") {
      return parts[1]
        ? `/(app)/messages/${decodeURIComponent(parts[1])}`
        : "/(app)/(tabs)/messages";
    }
  } catch {
    // fall through
  }
  return path;
}
