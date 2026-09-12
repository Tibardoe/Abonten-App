"use client";

import { getSubjectVerification } from "@/actions/verification/getSubjectVerification";
import { supabase } from "@/config/supabase/client";
import {
  VERIFICATION_CHIP_LABEL,
  ownerStatusCopy,
} from "@abonten/core/verification/copy";
import type {
  SubjectVerificationView,
  VerificationStatus,
} from "@abonten/types/verificationType";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IoCheckmarkCircle, IoShieldCheckmarkOutline } from "react-icons/io5";

// The organizer dashboard's entry point into verification. It renders
// nothing at all when the programme is switched off and the organizer has
// no existing verification — so a feature that is not open yet adds no
// clutter to the dashboard.

export default function OrganizerVerificationCard() {
  const [view, setView] = useState<SubjectVerificationView | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
        const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoaded(true);
        return;
      }
      const res = await getSubjectVerification({
        subjectType: "organizer",
        subjectId: user.id,
      });
      if (!cancelled) {
        if (res.status === 200 && res.data) setView(res.data);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !view) return null;

  const current = view.approved ?? view.openCase ?? view.lastClosedCase;
  const status = (current?.status ?? null) as VerificationStatus | null;
  const programOpen = view.program.organizerRequestsEnabled;

  // Nothing to say: programme closed and nothing ever submitted.
  if (!programOpen && !status) return null;

  if (status === "approved") {
    return (
      <section className="flex items-center gap-3 rounded-xl border border-mint/40 bg-mint/10 p-4">
        <IoCheckmarkCircle aria-hidden className="text-xl text-mint" />
        <div className="min-w-0">
          <h3 className="font-semibold">Verified organizer</h3>
          <p className="text-sm text-muted-foreground">
            Your badge shows on your events and your profile.
          </p>
        </div>
        <Link
          href="/manage/verification"
          className="ml-auto shrink-0 text-sm text-primary hover:underline"
        >
          View
        </Link>
      </section>
    );
  }

  const copy = status
    ? ownerStatusCopy(status, "organizer", {
        reason: current?.decisionReason,
      })
    : {
        title: "Get verified",
        body: "Show ticket buyers that Abonten has checked who is behind your events. Optional, and free.",
      };

  return (
    <section className="flex items-start gap-3 rounded-xl border border-border p-4">
      <IoShieldCheckmarkOutline
        aria-hidden
        className="mt-0.5 text-xl text-muted-foreground"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{copy.title}</h3>
          {status ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {VERIFICATION_CHIP_LABEL[status]}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{copy.body}</p>
        <Link
          href="/manage/verification"
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          {status ? "Open verification" : "Start verification"}
        </Link>
      </div>
    </section>
  );
}
