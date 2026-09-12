"use client";

import { Button } from "@/components/ui";
import { exportFieldOpsCampaignStats } from "@/server/actions";
import { useState, useTransition } from "react";

/**
 * The team table as a spreadsheet. Built in the browser from the action's
 * reply rather than served as a URL, so the figures never become a
 * guessable link.
 */
export function ExportTeamCsv({ campaignId }: { campaignId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setMsg(null);
      const res = await exportFieldOpsCampaignStats(campaignId);
      if (res.status !== 200 || !res.data) {
        setMsg(res.message ?? "Could not export.");
        return;
      }
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      a.click();
      URL.revokeObjectURL(url);
    });

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={run} disabled={pending}>
        Export the team as CSV
      </Button>
      {msg ? (
        <span className="text-xs text-muted-foreground">{msg}</span>
      ) : null}
    </div>
  );
}
