"use client";

import { getPlaceVisitPanel } from "@/actions/getPlaceVisitPanel";
import { Button } from "@/components/ui/button";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { IoClose, IoExpandOutline } from "react-icons/io5";

// The place owner's check-in code (Rewards Phase 8). Visitors scan it with
// their phone camera or the Abonten app while they're at the place. The code
// changes every 30 seconds, so a photo of it stops working almost at once;
// this refetches it as each one expires. Hidden while visits aren't live.
export default function PlaceVisitQrCard({
  placeId,
  placeName,
}: {
  placeId: string;
  placeName: string;
}) {
  const { data } = useQuery({
    queryKey: ["place-visit-panel", placeId],
    queryFn: () => getPlaceVisitPanel(placeId),
    refetchInterval: (query) => {
      const expiresAt = query.state.data?.data?.expiresAt;
      if (!expiresAt) return false;
      return Math.max(Date.parse(expiresAt) - Date.now(), 0) + 500;
    },
    refetchIntervalInBackground: false,
  });
  const panel = data?.status === 200 ? data.data : undefined;
  const [qr, setQr] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!panel?.url) return;
    let cancelled = false;
    QRCode.toDataURL(panel.url, { margin: 1, width: 640 })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => setQr(null));
    return () => {
      cancelled = true;
    };
  }, [panel?.url]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!panel?.available) return null;

  const secondsLeft = panel.expiresAt
    ? Math.max(Math.ceil((Date.parse(panel.expiresAt) - now) / 1000), 0)
    : 0;
  const s = panel.stats;

  const code = (size: string) =>
    qr ? (
      <img
        src={qr}
        alt={`Check-in code for ${placeName}`}
        className={`${size} aspect-square rounded-lg bg-white p-2`}
      />
    ) : (
      <div className={`${size} aspect-square rounded-lg bg-muted`} />
    );

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Visitor check-in</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Show this code at your counter or entrance. Visitors scan it with
            their phone while they&apos;re here to check in (once a day).
            {panel.verified
              ? ` Every different person who checks in during a month earns you ${formatCredit(panel.perVisitorMinor)} of promotion credit (up to ${panel.maxVisitors} a month).`
              : " Visits are counted now; only verified places earn promotion credit from them."}
          </p>
        </div>
        <Button variant="outline" onClick={() => setFullScreen(true)}>
          <IoExpandOutline className="mr-1" />
          Show on a screen
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        {code("w-40")}
        <dl className="grid flex-1 grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Today</dt>
            <dd className="text-lg font-semibold tabular-nums">{s.today}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Visitors this month</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {s.thisMonthVisitors}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last month</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {s.lastMonthVisitors}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Credit earned</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatCredit(s.earnedMinor)}
            </dd>
          </div>
        </dl>
      </div>
      <p className="text-xs text-muted-foreground">
        New code in {secondsLeft}s. Credit for a month is added early the next
        month.
      </p>

      {fullScreen ? (
        <dialog
          open
          aria-modal="true"
          aria-label={`Check-in code for ${placeName}`}
          className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none flex-col items-center justify-center gap-6 border-0 bg-background p-6 text-center text-foreground"
        >
          <button
            type="button"
            onClick={() => setFullScreen(false)}
            className="absolute right-4 top-4 rounded-full p-2 text-2xl hover:bg-muted"
            aria-label="Close"
          >
            <IoClose />
          </button>
          <p className="text-2xl font-bold md:text-4xl">{placeName}</p>
          {code("w-[min(80vw,70vh)]")}
          <p className="max-w-md text-lg text-muted-foreground">
            Scan with your phone camera or the Abonten app to check in.
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            New code in {secondsLeft}s
          </p>
        </dialog>
      ) : null}
    </section>
  );
}
