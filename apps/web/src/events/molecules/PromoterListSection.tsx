"use client";

import { addEventPromoter } from "@/actions/addEventPromoter";
import { removeEventPromoter } from "@/actions/removeEventPromoter";
import { setEventPromoterCommission } from "@/actions/setEventPromoterCommission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import TeamPersonAvatar from "@/teams/atoms/TeamPersonAvatar";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { EventPromoterCommission } from "@abonten/types/rewards";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

const pct = (bps: number) => Number((bps / 100).toFixed(2));

type Result = {
  status: number;
  message?: string;
  data?: EventPromoterCommission;
};

/**
 * Invited promoters on one event (X33, X36): the people the organizer adds,
 * each with their own rate if they like, and the switch that lets only them
 * earn. A member of the team running the event earns only when an Owner
 * added them; the server enforces it and the list says so.
 */
export default function PromoterListSection({
  eventId,
  offer,
  onSaved,
}: {
  eventId: string;
  offer: EventPromoterCommission;
  onSaved: (res: Result) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("events");
  const toast = useToast();
  const confirm = useConfirm();
  const [username, setUsername] = useState("");
  const [rate, setRate] = useState("");
  const [pending, start] = useTransition();

  const done = (res: Result, success: string) => {
    if (res.status === 200 && res.data) {
      onSaved(res);
      toast.success(success);
      return true;
    }
    toast.error(res.message ?? t("couldnTSaveTheCommission"));
    return false;
  };

  const typed = Number(rate.replace(",", "."));
  const typedBps = Math.round(typed * 100);
  const rateValid =
    rate.trim() === "" ||
    (Number.isFinite(typed) &&
      typedBps >= offer.minRateBps &&
      typedBps <= offer.maxRateBps);
  const full = offer.promoters.length >= offer.maxPromoters;

  const toggle = (invitedOnly: boolean) =>
    start(async () => {
      if (offer.rateBps === null) return;
      const res = await setEventPromoterCommission({
        eventId,
        rateBps: offer.rateBps,
        invitedOnly,
      }).catch(actionUnreachable);
      done(res, t(invitedOnly ? "invitedOnlySavedOn" : "invitedOnlySavedOff"));
    });

  const add = () =>
    start(async () => {
      const res = await addEventPromoter({
        eventId,
        username: username.trim(),
        rateBps: rate.trim() === "" ? null : typedBps,
      }).catch(actionUnreachable);
      if (done(res, t("promoterSavedToast"))) {
        setUsername("");
        setRate("");
      }
    });

  const remove = async (promoterId: string, name: string) => {
    const ok = await confirm({
      title: t("removePromoterTitle", { name }),
      message: t("removePromoterBody"),
      confirmLabel: t("removePromoter"),
    });
    if (!ok) return;
    start(async () => {
      const res = await removeEventPromoter({ eventId, promoterId }).catch(
        actionUnreachable,
      );
      done(res, t("promoterRemovedToast", { name }));
    });
  };

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div>
        <h3 className="font-semibold">{t("promotersTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("promotersHint")}
        </p>
      </div>

      <label
        htmlFor={`invited-only-${eventId}`}
        className="flex items-start gap-2 text-sm"
      >
        <input
          id={`invited-only-${eventId}`}
          type="checkbox"
          checked={offer.invitedOnly}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="font-medium">{t("invitedOnlyLabel")}</span>
          <span className="block text-muted-foreground">
            {t("invitedOnlyHint")}
          </span>
        </span>
      </label>
      {offer.invitedOnly && offer.promoters.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {t("invitedOnlyEmpty")}
        </p>
      ) : null}

      {offer.promoters.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {offer.promoters.map((p) => (
            <li key={p.userId} className="flex items-center gap-3 p-3">
              <TeamPersonAvatar
                publicId={p.avatarPublicId}
                version={p.avatarVersion}
                size={36}
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">
                  {p.name}
                  {p.username ? (
                    <span className="ml-1 font-normal text-muted-foreground">
                      @{p.username}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground">
                  {p.rateBps !== null
                    ? t("promoterOwnRate", { pct: pct(p.rateBps) })
                    : t("promoterEventRate")}
                  {p.teamMember ? ` · ${t("promoterTeamMember")}` : ""}
                </p>
                {p.teamMember && !p.approved ? (
                  <p className="text-amber-700 dark:text-amber-400">
                    {t("promoterNeedsOwner")}
                  </p>
                ) : null}
                <p className="tabular-nums text-muted-foreground">
                  {t("promoterFigures", {
                    sales: p.sales,
                    pending: formatCredit(
                      p.pendingMinor,
                      offer.currency,
                      locale,
                    ),
                    paid: formatCredit(p.paidMinor, offer.currency, locale),
                  })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => remove(p.userId, p.name)}
              >
                {t("removePromoter")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noPromotersYet")}</p>
      )}

      {full ? (
        <p className="text-sm text-muted-foreground">
          {t("promotersFull", { max: offer.maxPromoters })}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="text-sm">
            <label
              htmlFor={`promoter-user-${eventId}`}
              className="block text-muted-foreground"
            >
              {t("promoterUsernameLabel")}
            </label>
            <Input
              id={`promoter-user-${eventId}`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("promoterUsernamePlaceholder")}
              autoCapitalize="none"
              autoCorrect="off"
              className="mt-1 w-48"
            />
          </div>
          <div className="text-sm">
            <label
              htmlFor={`promoter-own-rate-${eventId}`}
              className="block text-muted-foreground"
            >
              {t("promoterRateLabel", {
                min: pct(offer.minRateBps),
                max: pct(offer.maxRateBps),
              })}
            </label>
            <span className="mt-1 flex items-center gap-1">
              <Input
                id={`promoter-own-rate-${eventId}`}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder={
                  offer.rateBps !== null ? String(pct(offer.rateBps)) : ""
                }
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </span>
          </div>
          <Button
            disabled={pending || username.trim() === "" || !rateValid}
            onClick={add}
          >
            {t("addPromoter")}
          </Button>
        </div>
      )}
    </div>
  );
}
