"use client";

import { setFieldOpsPayoutDestination } from "@/actions/fieldOps/setFieldOpsPayoutDestination";
import { Button } from "@/components/ui/button";
import type { FieldOpsPayoutDestination } from "@abonten/types/fieldOps";
import { useState, useTransition } from "react";

const NETWORKS = ["MTN", "Telecel", "AirtelTigo"] as const;

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
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!current?.numberMasked);
  const [saved, setSaved] = useState(current);
  const [number, setNumber] = useState("");
  const [network, setNetwork] = useState<(typeof NETWORKS)[number]>("MTN");
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
      });
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
        <h3 className="font-medium">Where you get paid</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {saved.network ?? "MoMo"} · {saved.numberMasked}
          {saved.holderName ? ` · ${saved.holderName}` : ""}
        </p>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => setEditing(true)}
        >
          Change
        </Button>
        {msg ? (
          <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4">
      <h3 className="font-medium">Where you get paid</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Your earnings are sent to this mobile money number. Make sure the name
        matches the account, or the transfer will fail.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Network</span>
          <select
            className={field}
            value={network}
            onChange={(e) =>
              setNetwork(e.target.value as (typeof NETWORKS)[number])
            }
          >
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Mobile money number</span>
          <input
            className={field}
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="024 123 4567"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
            maxLength={10}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name on the account</span>
          <input
            className={field}
            autoComplete="name"
            placeholder="As it appears on MoMo"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <Button
            onClick={submit}
            disabled={
              pending || number.trim().length !== 10 || holder.trim().length < 2
            }
          >
            Save
          </Button>
          {saved?.numberMasked ? (
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          ) : null}
        </div>
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      </div>
    </div>
  );
}
