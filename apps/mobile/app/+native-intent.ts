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
}: {
  path: string;
  initial: boolean;
}): Promise<string> {
  try {
    const url = new URL(
      path,
      path.startsWith("http") ? undefined : "https://abontenhub.com",
    );
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] === "events" && parts[1]) {
      const id = await resolveEvent(decodeURIComponent(parts[1]));
      return id ? `/(app)/event/${id}` : "/(app)/(tabs)";
    }
    if (parts[0] === "places" && parts[1]) {
      const id = await resolvePlace(decodeURIComponent(parts[1]));
      return id ? `/(app)/place/${id}` : "/(app)/(tabs)";
    }
  } catch {
    // fall through
  }
  return path;
}
