"use client";

import { recordPlaceVisit } from "@/actions/recordPlaceVisit";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { IoCheckmarkCircle, IoLocationOutline } from "react-icons/io5";

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; ok: boolean; message: string };

// Where the place's check-in QR code leads (/places/<slug>?visit=CODE). The
// visitor confirms, the browser shares their location once, and the server
// checks the code and that they're at the place (Rewards Phase 8).
export default function PlaceCheckIn({
  placeId,
  placeName,
  ownerId,
}: {
  placeId: string;
  placeName: string;
  ownerId: string;
}) {
  const code = useSearchParams().get("visit");
  const pathname = usePathname();
  const { data: user, isLoading } = useCurrentUser();
  const [state, setState] = useState<State>({ kind: "idle" });

  if (!code || isLoading || user?.id === ownerId) return null;

  const checkIn = () => {
    if (!("geolocation" in navigator)) {
      setState({
        kind: "done",
        ok: false,
        message: "This browser can't share your location. Try the Abonten app.",
      });
      return;
    }
    setState({ kind: "working" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await recordPlaceVisit({
          placeId,
          code,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
        setState({
          kind: "done",
          ok: res.status === 200,
          message: res.message ?? "Couldn't check you in. Try again.",
        });
      },
      () =>
        setState({
          kind: "done",
          ok: false,
          message:
            "We need your location to check you in. Allow location for this site and try again.",
        }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const next = `${pathname}?visit=${encodeURIComponent(code)}`;

  return (
    <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm border border-primary/30">
      {state.kind === "done" && state.ok ? (
        <p className="flex items-center gap-2 font-medium">
          <IoCheckmarkCircle className="text-primary text-xl shrink-0" />
          {state.message}
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Check in at {placeName}</p>
            <p className="text-sm text-muted-foreground">
              {user
                ? "We'll use your location once to confirm you're here."
                : "Sign in to check in."}
            </p>
            {state.kind === "done" && !state.ok ? (
              <p className="mt-1 text-sm text-destructive">{state.message}</p>
            ) : null}
          </div>
          {user ? (
            <Button onClick={checkIn} disabled={state.kind === "working"}>
              <IoLocationOutline className="mr-1" />
              {state.kind === "working" ? "Checking you in…" : "Check in"}
            </Button>
          ) : (
            <Link
              href={`/auth/signin?next=${encodeURIComponent(next)}`}
              className={buttonVariants()}
            >
              Sign in
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
