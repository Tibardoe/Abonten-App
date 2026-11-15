"use client";

import { acceptTicketTransfer } from "@/actions/ticketTransfers/acceptTicketTransfer";
import { declineTicketTransfer } from "@/actions/ticketTransfers/declineTicketTransfer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import {
  buildAvatarUrl,
  buildCloudinaryUrl,
} from "@abonten/core/cloudinaryUrl";
import { formatDateTime } from "@abonten/core/i18n/format";
import { personName } from "@abonten/core/personName";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import type { IncomingTicketTransfer } from "@abonten/types/ticketTransferType";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";
import {
  useRefreshAfterTransfer,
  useTicketTransfers,
} from "../useTicketTransfers";

/**
 * "Tickets sent to you": every offer waiting for the person, with Accept
 * and Decline. Nothing is shown when there is none. Answering works even
 * while the programme is switched off, so no ticket is left between two
 * people.
 */
export default function TicketOffersPanel() {
  const t = useTranslations("tickets");
  const { data } = useTicketTransfers();
  const offers = data?.incoming ?? [];
  if (offers.length === 0) return null;

  return (
    <section
      aria-labelledby="ticket-offers-title"
      className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3"
    >
      <h2 id="ticket-offers-title" className="font-semibold">
        {t("offersTitle")}
      </h2>
      <ul className="space-y-3">
        {offers.map((offer) => (
          <TicketOfferRow key={offer.id} offer={offer} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("onlyAcceptSent")}</p>
    </section>
  );
}

function TicketOfferRow({ offer }: { offer: IncomingTicketTransfer }) {
  const t = useTranslations("tickets");
  const tc = useTranslations("core");
  const locale = useLocale();
  const toast = useToast();
  const refresh = useRefreshAfterTransfer();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  const from =
    personName(tc, {
      full_name: offer.from.name,
      username: offer.from.username,
    }) ?? "";

  const answer = async (kind: "accept" | "decline") => {
    setBusy(kind);
    const res =
      kind === "accept"
        ? await acceptTicketTransfer({ transferId: offer.id }).catch(
            actionUnreachable,
          )
        : await declineTicketTransfer({ transferId: offer.id }).catch(
            actionUnreachable,
          );
    setBusy(null);
    if (res.status === 200) {
      toast.success(
        kind === "accept" ? t("acceptedToast") : t("declinedToast"),
      );
      refresh();
    } else {
      toast.error(res.message ?? t("couldNotAnswer"));
      refresh();
    }
  };

  return (
    <li className="flex gap-3 rounded-lg bg-card p-3 border border-border">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
        <Image
          src={buildCloudinaryUrl(
            offer.event.flyerPublicId,
            offer.event.flyerVersion,
            { width: 128, height: 128 },
          )}
          alt={offer.event.title}
          fill
          className="object-cover"
          sizes="64px"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Image
            src={buildAvatarUrl(
              offer.from.avatarPublicId,
              offer.from.avatarVersion,
              { width: 40, height: 40 },
            )}
            alt=""
            width={20}
            height={20}
            className="rounded-full"
          />
          <p className="text-sm font-medium truncate">
            {t("offerFrom", { name: from })}
          </p>
        </div>
        <p className="text-sm font-semibold line-clamp-1">
          {offer.event.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {offer.ticketType ? (
            <span>{ticketTypeLabel(tc, offer.ticketType)} · </span>
          ) : null}
          <span>
            {t("acceptBefore", {
              date: formatDateTime(offer.expiresAt, locale),
            })}
          </span>
        </p>
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => answer("accept")}
          >
            {busy === "accept" ? t("accepting") : t("acceptTicket")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => answer("decline")}
          >
            {t("declineTicket")}
          </Button>
        </div>
      </div>
    </li>
  );
}
