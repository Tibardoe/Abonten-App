"use client";

import { Badge, Button, Card, cn } from "@/components/ui";
import { upsertFeatureFlag } from "@/server/actions/markets";
import type { FlagRules } from "@abonten/core/flags/evaluateFlag";
import type { FeatureFlagRow } from "@abonten/services/admin/markets/marketsAdminCore";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";
const label = "flex flex-col gap-1 text-xs";

function rulesSummary(rules: FlagRules | null): string {
  if (!rules) return "everyone";
  const parts: string[] = [];
  if (rules.countries?.length) parts.push(rules.countries.join("/"));
  if (rules.platforms?.length) parts.push(rules.platforms.join("/"));
  if (rules.cohorts?.length) parts.push(`cohort ${rules.cohorts.join("/")}`);
  if (rules.minAppVersion) parts.push(`≥ ${rules.minAppVersion}`);
  if (typeof rules.percent === "number") parts.push(`${rules.percent}%`);
  return parts.join(" · ") || "everyone";
}

export function FlagsEditor({
  flags,
  canManage,
}: { flags: FeatureFlagRow[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [countries, setCountries] = useState("");
  const [platforms, setPlatforms] = useState("");
  const [cohorts, setCohorts] = useState("");
  const [percent, setPercent] = useState("");
  const [minAppVersion, setMinAppVersion] = useState("");

  function load(f: FeatureFlagRow) {
    setKey(f.key);
    setDescription(f.description);
    setEnabled(f.enabled);
    setCountries((f.rules?.countries ?? []).join(", "));
    setPlatforms((f.rules?.platforms ?? []).join(", "));
    setCohorts((f.rules?.cohorts ?? []).join(", "));
    setPercent(
      typeof f.rules?.percent === "number" ? String(f.rules.percent) : "",
    );
    setMinAppVersion(f.rules?.minAppVersion ?? "");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Flags</h2>
        <ul className="divide-y divide-border text-sm">
          {flags.map((f) => (
            <li key={f.key} className="flex items-center gap-2 py-2">
              <Badge tone={f.enabled ? "success" : "neutral"}>
                {f.enabled ? "on" : "off"}
              </Badge>
              <button
                type="button"
                className="font-mono text-xs hover:underline"
                onClick={() => load(f)}
              >
                {f.key}
              </button>
              <span className="text-xs text-muted-foreground">
                {rulesSummary(f.rules)}
              </span>
            </li>
          ))}
          {flags.length === 0 ? (
            <li className="py-2 text-xs text-muted-foreground">
              No flags yet.
            </li>
          ) : null}
        </ul>
      </Card>
      {canManage ? (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Create or edit a flag</h2>
          <form
            className="grid grid-cols-2 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              const list = (s: string) =>
                s
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean);
              const rules: FlagRules = {};
              if (countries.trim())
                rules.countries = list(countries).map((c) => c.toUpperCase());
              if (platforms.trim())
                rules.platforms = list(platforms) as FlagRules["platforms"];
              if (cohorts.trim()) rules.cohorts = list(cohorts);
              if (percent.trim()) rules.percent = Number(percent);
              if (minAppVersion.trim())
                rules.minAppVersion = minAppVersion.trim();
              start(async () => {
                const res = await upsertFeatureFlag({
                  key: key.trim(),
                  description,
                  enabled,
                  rules: Object.keys(rules).length ? rules : null,
                });
                setMsg(
                  res.message ?? (res.status === 200 ? "Saved." : "Failed"),
                );
                if (res.status === 200) router.refresh();
              });
            }}
          >
            <label className={cn(label, "col-span-2")}>
              Key
              <input
                className={cn(input, "font-mono")}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="checkout.new_summary"
                required
              />
            </label>
            <label className={cn(label, "col-span-2")}>
              Description
              <input
                className={input}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className={label}>
              Countries (blank = all)
              <input
                className={input}
                value={countries}
                onChange={(e) => setCountries(e.target.value)}
                placeholder="NG, KE"
              />
            </label>
            <label className={label}>
              Platforms (blank = all)
              <input
                className={input}
                value={platforms}
                onChange={(e) => setPlatforms(e.target.value)}
                placeholder="web, ios, android"
              />
            </label>
            <label className={label}>
              Cohorts (blank = all)
              <input
                className={input}
                value={cohorts}
                onChange={(e) => setCohorts(e.target.value)}
                placeholder="staff, beta"
              />
            </label>
            <label className={label}>
              Rollout percent (blank = 100)
              <input
                className={input}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="25"
              />
            </label>
            <label className={label}>
              Minimum app version
              <input
                className={input}
                value={minAppVersion}
                onChange={(e) => setMinAppVersion(e.target.value)}
                placeholder="1.4.0"
              />
            </label>
            <label className="flex items-center gap-2 self-end text-xs">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />{" "}
              Enabled
            </label>
            <div className="col-span-2 flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pending || !key.trim()}>
                {pending ? "Saving…" : "Save flag"}
              </Button>
              {msg ? (
                <span className="text-xs text-muted-foreground">{msg}</span>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
