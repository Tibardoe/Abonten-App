"use client";

import { setFieldOpsPayoutDestination } from "@/actions/fieldOps/setFieldOpsPayoutDestination";
import { Button } from "@/components/ui/button";
import { actionUnreachable } from "@/utils/actionUnreachable";
import type { FieldOpsPayoutDestination } from "@abonten/types/fieldOps";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

const field =
  "w-full rounded-lg border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-primary";

/**
 * Where the member's earnings are sent. The number is stored server-side
 * and only ever read back masked, so the form starts empty on every visit
 * rather than pre-filling something we cannot show in full.
 */
export default function PayoutDestinationForm({
  campaignId,
  current,
}: {
  campaignId: string;
  current: FieldOpsPayoutDestination | null;
}) {
  const t = useTranslations("fieldOps");

  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!current?.numberMasked);
  const [saved, setSaved] = useState(current);
  const [number, setNumber] = useState("");
  // The campaign country's networks, as its payment provider lists them;
  // a free-text field when the provider can't list any.
  const networks = current?.availableNetworks ?? [];
  const [network, setNetwork] = useState(current?.network ?? networks[0] ?? "");
  const [holder, setHolder] = useState(current?.holderName ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setMsg(null);
      const res = await setFieldOpsPayoutDestination({
        campaignId,
        momoNumber: number.trim(),
        momoNetwork: network,
        holderName: holder.trim(),
      }).catch(actionUnreachable);
      setMsg(res.message ?? null);
      if (res.status === 200 && res.data) {
        setSaved(res.data);
        setNumber("");
        setEditing(false);
      }
    });

  if (!editing && saved?.numberMasked) {
    return (
      <div className="rounded-xl border p-4">
        <h3 className="font-medium">{t("whereYouGetPaid")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {saved.network ?? "MoMo"} · {saved.numberMasked}
          {saved.holderName ? ` · ${saved.holderName}` : ""}
        </p>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => setEditing(true)}
        >
          {t("change")}
        </Button>
        {msg ? (
          <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4">
      <h3 className="font-medium">{t("whereYouGetPaid")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("yourEarningsAreSentToThis")}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="payout-network" className="text-sm font-medium">
            {t("network")}
          </label>
          {networks.length > 0 ? (
            <select
              id="payout-network"
              className={field}
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
            >
              {networks.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="payout-network"
              className={field}
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              placeholder={t("yourMobileMoneyNetwork")}
            />
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("mobileMoneyNumber")}</span>
          <input
            className={field}
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("yourMobileMoneyNumber")}
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^\d+ ]/g, ""))}
            maxLength={20}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("nameOnTheAccount")}</span>
          <input
            className={field}
            autoComplete="name"
            placeholder={t("asItAppearsOnTheAccount")}
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <Button
            onClick={submit}
            disabled={
              pending ||
              number.replace(/\D/g, "").length < 7 ||
              network.trim().length < 2 ||
              holder.trim().length < 2
            }
          >
            {t("save")}
          </Button>
          {saved?.numberMasked ? (
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
          ) : null}
        </div>
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      </div>
    </div>
  );
}
