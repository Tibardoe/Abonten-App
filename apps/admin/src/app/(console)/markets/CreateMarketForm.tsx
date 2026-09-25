"use client";

import { Button, Card } from "@/components/ui";
import { createMarket } from "@/server/actions/markets";
import { COUNTRIES } from "@abonten/core/geo/countries";
import { COUNTRY_DEFAULTS } from "@abonten/core/geo/countryDefaults";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

// Adding a country: it starts in draft with curated defaults (currency,
// zone, locale, distance unit) that the detail page lets you change.
export function CreateMarketForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const known = Object.keys(COUNTRY_DEFAULTS);

  return (
    <Card className="p-4">
      <h2 className="mb-2 text-sm font-semibold">Add a country</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Countries with curated defaults are listed first; any other ISO country
        can be added and configured by hand.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          start(async () => {
            const res = await createMarket({ countryCode: code });
            if (res.status === 200 && "data" in res && res.data) {
              router.push(`/markets/${res.data.countryCode}`);
            } else {
              setMsg(res.message ?? "Couldn't create the market.");
            }
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          Country
          <select
            className={input}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          >
            <option value="">Choose…</option>
            <optgroup label="With defaults">
              {COUNTRIES.filter((c) => known.includes(c.code)).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.code})
                </option>
              ))}
            </optgroup>
            <optgroup label="Other countries">
              {COUNTRIES.filter((c) => !known.includes(c.code)).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.code})
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <Button type="submit" disabled={pending || !code}>
          {pending ? "Creating…" : "Create draft market"}
        </Button>
        {msg ? <p className="text-xs text-destructive">{msg}</p> : null}
      </form>
    </Card>
  );
}
