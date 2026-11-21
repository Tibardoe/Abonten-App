import {
  canReadInstallReferrer,
  firstTimeOnThisInstall,
  getInstallReferrer,
} from "@/lib/installReferrer";
import { supabase } from "@/lib/supabase";
import {
  type AppOpenTarget,
  appOpenFromInstallReferrer,
} from "@abonten/core/social/appLinks";
import type { LinkSource } from "@abonten/core/social/linkSources";
import { type Href, useRouter } from "expo-router";
import { useEffect } from "react";
import { Linking } from "react-native";

// Android: someone without the app tapped "Get the app" on a listing's web
// page (/go/app?open=/events/<code>&src=ig). The Play Store link carried
// open=<path>&src=<code> as its install referrer; on the first start after
// the install the app opens that listing once, signed in or not, with the
// source as the screen's `src` param
// (docs/architecture/social-distribution.md).

const CHECKED_KEY = "abonten.installListingChecked";
// Only soon after the install. The first start of a new install runs the
// code built into the store binary, and an update with this hook runs from
// the next start, so the window has to cover that start too; past it,
// opening a listing out of nowhere would only surprise.
const INSTALL_WINDOW_MS = 48 * 3_600_000;
// Never pull someone away from what they have started doing meanwhile.
const DEADLINE_MS = 15_000;

async function listingId(target: AppOpenTarget): Promise<string | null> {
  // The same cheap public read the universal-link handler makes
  // (app/+native-intent.ts); event codes are stored in upper case.
  const { data } =
    target.kind === "event"
      ? await supabase
          .from("event")
          .select("id")
          .eq("event_code", target.code.toUpperCase())
          .maybeSingle()
      : await supabase
          .from("place")
          .select("id")
          .eq("slug", target.slug)
          .maybeSingle();
  return data?.id ?? null;
}

function listingHref(
  target: AppOpenTarget,
  id: string,
  source: LinkSource | null,
): Href {
  const params = source ? { id, src: source } : { id };
  return target.kind === "event"
    ? { pathname: "/(app)/event/[id]", params }
    : { pathname: "/(app)/place/[id]", params };
}

async function findInstallListing(): Promise<Href | null> {
  if (!canReadInstallReferrer()) return null;
  if (!(await firstTimeOnThisInstall(CHECKED_KEY))) return null;
  try {
    const Application = await import("expo-application");
    const installedAt = await Application.getInstallationTimeAsync();
    if (!installedAt || Date.now() - installedAt.getTime() > INSTALL_WINDOW_MS)
      return null;
    // Opened from a link: that link wins.
    if (await Linking.getInitialURL()) return null;
    const found = appOpenFromInstallReferrer(await getInstallReferrer());
    if (!found) return null;
    const id = await listingId(found.target);
    return id ? listingHref(found.target, id, found.source) : null;
  } catch {
    return null;
  }
}

let lookup: Promise<Href | null> | null = null;
let opened = false;

/** Opens the listing an Android install came from, once. */
export function useInstallListingOpen() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const startedAt = Date.now();
    if (!lookup) lookup = findInstallListing();
    lookup.then((href) => {
      if (!href || opened || !active) return;
      if (Date.now() - startedAt > DEADLINE_MS) return;
      opened = true;
      router.push(href);
    });
    return () => {
      active = false;
    };
  }, [router]);
}
