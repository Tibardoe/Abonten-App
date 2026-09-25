"use client";

import { Badge, Button, Card, cn } from "@/components/ui";
import {
  refreshExchangeRates,
  setExchangeRateConfig,
  setManualExchangeRate,
} from "@/server/actions/markets";
import type { RateTable } from "@abonten/core/money/conversion";
import { RATE_STALE_AFTER_MS } from "@abonten/core/money/conversion";
import type { ExchangeRateConfig } from "@abonten/services/fx/exchangeRateCore";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";
const label = "flex flex-col gap-1 text-xs";

export function RatesPanel({
  config,
  table,
  canManage,
}: {
  config: ExchangeRateConfig;
  table: RateTable | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [provider, setProvider] = useState(config.provider);
  const [base, setBase] = useState(config.base);
  const [appIdEnv, setAppIdEnv] = useState(config.appIdEnv);
  const [refreshUrl, setRefreshUrl] = useState(config.refreshUrl ?? "");
  const [quote, setQuote] = useState("");
  const [rate, setRate] = useState("");

  const stale = table
    ? Date.now() - new Date(table.asOf).getTime() > RATE_STALE_AFTER_MS
    : false;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Rates on file</h2>
          {table ? (
            <Badge tone={stale ? "warning" : "success"}>
              {stale ? "stale" : "fresh"}
            </Badge>
          ) : (
            <Badge tone="danger">none</Badge>
          )}
          {table ? (
            <span className="text-xs text-muted-foreground">
              base {table.base} · as of{" "}
              {table.asOf.slice(0, 16).replace("T", " ")} · {table.source}
            </span>
          ) : null}
        </div>
        {table ? (
          <ul className="grid grid-cols-3 gap-x-4 text-xs sm:grid-cols-4">
            {Object.entries(table.rates)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([code, r]) => (
                <li
                  key={code}
                  className="flex justify-between border-b border-border py-0.5"
                >
                  <span className="font-mono">{code}</span>
                  <span>
                    {r.toLocaleString("en-GB", { maximumFractionDigits: 4 })}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No rates yet. Configure a provider and refresh, or enter rates by
            hand.
          </p>
        )}
        {config.lastError ? (
          <p className="mt-2 text-xs text-destructive">
            Last error: {config.lastError}
          </p>
        ) : null}
        {canManage ? (
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              disabled={pending || provider !== "openexchangerates"}
              onClick={() => {
                setMsg(null);
                start(async () => {
                  const res = await refreshExchangeRates();
                  setMsg(
                    res.status === 200
                      ? `Refreshed ${"data" in res && res.data ? res.data.count : ""} rates.`
                      : (res.message ?? "Refresh failed"),
                  );
                  if (res.status === 200) router.refresh();
                });
              }}
            >
              {pending ? "Refreshing…" : "Refresh now"}
            </Button>
            {msg ? (
              <span className="text-xs text-muted-foreground">{msg}</span>
            ) : null}
          </div>
        ) : null}
      </Card>

      {canManage ? (
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Provider</h2>
            <form
              className="grid grid-cols-2 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setMsg(null);
                start(async () => {
                  const res = await setExchangeRateConfig({
                    provider,
                    base,
                    appIdEnv,
                    refreshUrl: refreshUrl.trim() || null,
                  });
                  setMsg(
                    res.message ?? (res.status === 200 ? "Saved." : "Failed"),
                  );
                  if (res.status === 200) router.refresh();
                });
              }}
            >
              <label className={label}>
                Provider
                <select
                  className={input}
                  value={provider}
                  onChange={(e) =>
                    setProvider(e.target.value as typeof provider)
                  }
                >
                  <option value="off">Off (no estimates)</option>
                  <option value="openexchangerates">
                    Open Exchange Rates (hourly)
                  </option>
                  <option value="manual">Manual rates only</option>
                </select>
              </label>
              <label className={label}>
                Base currency
                <input
                  className={input}
                  value={base}
                  onChange={(e) => setBase(e.target.value.toUpperCase())}
                />
              </label>
              <label className={label}>
                App id env var name
                <input
                  className={cn(input, "font-mono")}
                  value={appIdEnv}
                  onChange={(e) => setAppIdEnv(e.target.value)}
                />
              </label>
              <label className={label}>
                Refresh URL (for the cron job)
                <input
                  className={input}
                  value={refreshUrl}
                  onChange={(e) => setRefreshUrl(e.target.value)}
                  placeholder="https://abontenhub.com/api/jobs/exchange-rates"
                />
              </label>
              <div className="col-span-2">
                <Button type="submit" size="sm" disabled={pending}>
                  Save provider settings
                </Button>
              </div>
            </form>
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Enter a rate by hand</h2>
            <form
              className="grid grid-cols-3 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setMsg(null);
                start(async () => {
                  const res = await setManualExchangeRate({
                    base,
                    quote: quote.toUpperCase(),
                    rate: Number(rate),
                  });
                  setMsg(
                    res.message ?? (res.status === 200 ? "Saved." : "Failed"),
                  );
                  if (res.status === 200) router.refresh();
                });
              }}
            >
              <label className={label}>
                Quote currency
                <input
                  className={input}
                  value={quote}
                  onChange={(e) => setQuote(e.target.value.toUpperCase())}
                  placeholder="GHS"
                  required
                />
              </label>
              <label className={label}>
                Units of quote per 1 {base}
                <input
                  className={input}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="15.5"
                  required
                />
              </label>
              <div className="self-end">
                <Button type="submit" size="sm" disabled={pending}>
                  Save rate
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
