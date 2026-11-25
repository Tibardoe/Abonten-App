"use client";

import { confirmGatePartnerVoids } from "@/actions/gatePartners/confirmGatePartnerVoids";
import { getEventGatePartner } from "@/actions/gatePartners/getEventGatePartner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatMoney } from "@abonten/core/formatMoney";
import { gatePartnerName } from "@abonten/core/gatePartners/gateLinkRules";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

/**
 * An event whose gate is run by the organizer's own check-in system (a
 * gate partner such as Hapniin; docs/architecture/gate-partner-connectors.md).
 * Read-only: Abonten staff set the link up. `compact` (the Check-in tab)
 * only says where check-in happens.
 */
export default function GatePartnerCard({
  eventId,
  compact = false,
}: {
  eventId: string;
  compact?: boolean;
}) {
  const t = useTranslations("events");
  const tc = useTranslations("core");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const key = ["event-gate-partner", eventId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getEventGatePartner({ eventId }),
    staleTime: 30_000,
  });
  const [pending, start] = useTransition();

  const link = data?.status === 200 && "data" in data ? data.data : null;
  if (!link?.linked) return null;
  const partner = gatePartnerName(link.provider);

  if (compact) {
    return (
      <section className="mb-6 rounded-xl border border-primary/40 bg-primary/5 p-5 space-y-1">
        <h2 className="font-semibold">
          {t("gatePartner.checkInTitle", { partner })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("gatePartner.checkInBody", { partner })}
        </p>
      </section>
    );
  }

  const voidAll = async () => {
    const ok = await confirm({
      title: t("gatePartner.confirmVoidedTitle", { count: link.toVoid.length }),
      message: t("gatePartner.confirmVoided", { partner }),
      confirmLabel: t("gatePartner.markVoided"),
    });
    if (!ok) return;
    start(async () => {
      const res = await confirmGatePartnerVoids({
        eventId,
        ticketIds: link.toVoid.map((v) => v.ticketId),
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(t("gatePartner.voidedSaved"));
        await qc.invalidateQueries({ queryKey: key });
      } else {
        toast.error(
          ("message" in res ? res.message : null) ??
            t("gatePartner.couldNotSave"),
        );
      }
    });
  };

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="font-semibold">{t("gatePartner.title", { partner })}</h2>
        <p className="text-sm text-muted-foreground">
          {t("gatePartner.body", { partner })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("gatePartner.setByStaff")}
        </p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">
            {t("gatePartner.partnerEvent", { partner })}
          </dt>
          <dd className="font-medium">
            {link.partnerEventTitle ?? link.partnerEventId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("gatePartner.salesLabel")}
          </dt>
          <dd className="font-medium">
            {link.status === "active"
              ? t("gatePartner.salesOn")
              : t("gatePartner.salesPaused")}
          </dd>
        </div>
      </dl>

      <div className="space-y-1">
        <p className="text-sm font-medium">{t("gatePartner.ticketsLabel")}</p>
        <ul className="space-y-1 text-sm">
          {link.products.map((p) => (
            <li
              key={p.ticketTypeId}
              className="flex flex-wrap justify-between gap-2"
            >
              <span>{ticketTypeLabel(tc, p.ticketType)}</span>
              <span className="text-muted-foreground">
                {t("gatePartner.productLine", {
                  partner,
                  product: p.partnerProductName ?? p.partnerProductId,
                  price: formatMoney(link.currency, p.price, { locale }),
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-0.5 text-sm text-muted-foreground">
        <p>{t("gatePartner.countsCodes", { count: link.ticketsWithCodes })}</p>
        <p>{t("gatePartner.countsWaiting", { count: link.salesWaiting })}</p>
      </div>
      {link.salesNeedingStaff > 0 ? (
        <p className="text-sm text-destructive">
          {t("gatePartner.needsStaff", { count: link.salesNeedingStaff })}
        </p>
      ) : null}

      {link.toVoid.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-destructive/40 p-4">
          <p className="text-sm font-semibold">
            {t("gatePartner.toVoidTitle", {
              count: link.toVoid.length,
              partner,
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("gatePartner.toVoidBody", { partner })}
          </p>
          <ul className="flex flex-wrap gap-2">
            {link.toVoid.map((v) => (
              <li
                key={v.ticketId}
                className="rounded border border-border px-2 py-1 font-mono text-sm"
              >
                {v.code}
              </li>
            ))}
          </ul>
          <Button variant="outline" disabled={pending} onClick={voidAll}>
            {t("gatePartner.markVoided")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
