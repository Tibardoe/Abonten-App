"use client";

import { getRecommendationPrompt } from "@/actions/discovery/getRecommendationPrompt";
import { markRecommendationPromptShown } from "@/actions/discovery/markRecommendationPromptShown";
import { respondToRecommendationPrompt } from "@/actions/discovery/respondToRecommendationPrompt";
import { cn } from "@/components/lib/utils";
import { useToast } from "@/hooks/useToast";
import type { PromptContext, PromptOffer } from "@abonten/types/discoveryType";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IoClose, IoNotificationsOutline } from "react-icons/io5";

// The explicit opt-in shown after a meaningful interaction: a ticket or an
// RSVP ("Enjoy events like this?"), or favoriting / reviewing / revisiting a
// place ("Like this place?"). It never blocks the flow it sits in, it can
// always be dismissed, nothing is subscribed until the person presses
// "Turn on notifications", and the server decides whether it may appear at
// all (programme on, not already subscribed, not dismissed recently, at most
// one prompt a week).

function isEmpty(offer: PromptOffer | undefined): boolean {
  return !offer || (!offer.similarEvents && !offer.organizer && !offer.place);
}

export default function RecommendationPromptCard({
  context,
  className,
  onClose,
}: {
  context: PromptContext;
  className?: string;
  onClose?: () => void;
}) {
  const toast = useToast();
  const [alsoOrganizer, setAlsoOrganizer] = useState(false);
  const [done, setDone] = useState<null | "accepted" | "dismissed">(null);
  const recorded = useRef(false);

  const { data: offer } = useQuery({
    queryKey: ["recommendation-prompt", context],
    queryFn: async () => {
      const res = await getRecommendationPrompt(context);
      return "data" in res ? res.data : undefined;
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  useEffect(() => {
    if (!isEmpty(offer) && !recorded.current) {
      recorded.current = true;
      void markRecommendationPromptShown(context);
    }
  }, [offer, context]);

  const respond = useMutation({
    mutationFn: (response: "accepted" | "dismissed") =>
      respondToRecommendationPrompt({
        context,
        response,
        accept:
          response === "accepted"
            ? { similarEvents: true, organizer: alsoOrganizer, place: true }
            : undefined,
      }),
    onSuccess: (res, response) => {
      if (res.status !== 200) {
        toast.error(res.message ?? "Couldn't save that. Please try again.");
        return;
      }
      setDone(response);
      if (response === "dismissed") onClose?.();
    },
    onError: () => toast.error("Couldn't save that. Please try again."),
  });

  if (isEmpty(offer) || done === "dismissed") return null;

  if (done === "accepted") {
    return (
      <output
        className={cn(
          "block rounded-2xl border border-border bg-card px-5 py-4 text-sm",
          className,
        )}
      >
        <p className="font-medium">Notifications on.</p>
        <p className="mt-1 text-muted-foreground">
          We'll only send what you asked for, and never more than one pick a
          day.{" "}
          <Link
            href="/settings/notifications"
            className="text-primary hover:underline"
          >
            Manage
          </Link>
        </p>
      </output>
    );
  }

  const place = offer?.place;
  const similar = offer?.similarEvents;
  const organizer = offer?.organizer;

  const title = place ? "Like this place?" : "Enjoy events like this?";
  const body = place
    ? `Get updates from ${place.name} and discover similar places nearby.`
    : `Get notified when similar ${similar?.category ?? ""} events are happening${
        similar?.locality ? ` near ${similar.locality}` : " near you"
      }.`;

  return (
    <section
      aria-labelledby="recommendation-prompt-title"
      className={cn(
        "relative rounded-2xl border border-border bg-card px-5 py-5 text-left shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Not now"
        onClick={() => respond.mutate("dismissed")}
        disabled={respond.isPending}
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <IoClose aria-hidden />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <IoNotificationsOutline aria-hidden className="text-xl" />
        </span>
        <div className="min-w-0">
          <h3 id="recommendation-prompt-title" className="font-semibold">
            {title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          {organizer && !place ? (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={alsoOrganizer}
                onChange={(e) => setAlsoOrganizer(e.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              Also tell me when @{organizer.username} posts a new event
            </label>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => respond.mutate("accepted")}
          disabled={respond.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          Turn on notifications
        </button>
        <button
          type="button"
          onClick={() => respond.mutate("dismissed")}
          disabled={respond.isPending}
          className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
