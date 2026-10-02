"use client";

import { getSubjectVerification } from "@/actions/verification/getSubjectVerification";
import { supabase } from "@/config/supabase/client";
import { actionUnreachable } from "@/utils/actionUnreachable";
import {
  ownerStatusCopy,
  verificationChipLabel,
} from "@abonten/core/verification/copy";
import type {
  SubjectVerificationView,
  VerificationStatus,
} from "@abonten/types/verificationType";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IoCheckmarkCircle, IoShieldCheckmarkOutline } from "react-icons/io5";

// The organizer dashboard's entry point into verification. It renders
// nothing at all when the programme is switched off and the organizer has
// no existing verification — so a feature that is not open yet adds no
// clutter to the dashboard.

export default function OrganizerVerificationCard() {
  const t = useTranslations("verification");
  const tc = useTranslations("core");

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
      }).catch(actionUnreachable);
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
        <IoCheckmarkCircle aria-hidden className="text-xl text-primary" />
        <div className="min-w-0">
          <h3 className="font-semibold">{t("verifiedOrganizer")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("yourBadgeShowsOnYourEvents")}
          </p>
        </div>
        <Link
          href="/manage/verification"
          className="ml-auto shrink-0 text-sm text-primary hover:underline"
        >
          {t("view")}
        </Link>
      </section>
    );
  }

  const copy = status
    ? ownerStatusCopy(tc, status, "organizer", {
        reason: current?.decisionReason,
      })
    : {
        title: t("getVerified"),
        body: t("showTicketBuyersThatAbontenHas"),
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
              {verificationChipLabel(tc, status)}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{copy.body}</p>
        <Link
          href="/manage/verification"
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          {status ? t("openVerification") : t("startVerification")}
        </Link>
      </div>
    </section>
  );
}
