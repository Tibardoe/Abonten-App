"use client";

import { setFieldOpsLeadTerritoryStatus } from "@/actions/fieldOps/setFieldOpsLeadTerritoryStatus";
import { Button } from "@/components/ui/button";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import LeadTerritoryForm from "@/fieldOps/organisms/LeadTerritoryForm";
import { useToast } from "@/hooks/useToast";
import type { FieldOpsTerritory } from "@abonten/types/fieldOps";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** The region's territories with edit / complete / reopen, plus the add form. */
export default function LeadTerritoryList({
  campaignId,
  territories,
  editable,
}: {
  campaignId: string;
  territories: FieldOpsTerritory[];
  editable: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const towns = territories.filter((t) => t.kind === "town");

  const setStatus = (id: string, status: "active" | "completed") =>
    start(async () => {
      const res = await setFieldOpsLeadTerritoryStatus({
        campaignId,
        territoryId: id,
        status,
      });
      if (res.status === 200) {
        toast.success(res.message ?? "Saved.");
        router.refresh();
      } else {
        toast.error(res.message ?? "Couldn't do that.");
      }
    });

  return (
    <div className="flex flex-col gap-4">
      {editable ? (
        adding ? (
          <LeadTerritoryForm
            campaignId={campaignId}
            towns={towns}
            onDone={() => setAdding(false)}
          />
        ) : (
          <Button onClick={() => setAdding(true)} className="w-full md:w-auto">
            Add a town or area
          </Button>
        )
      ) : null}

      {territories.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No territories yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {territories.map((t) =>
            editing === t.id ? (
              <li key={t.id}>
                <LeadTerritoryForm
                  campaignId={campaignId}
                  towns={towns}
                  initial={t}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={t.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/field/territory/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {t.kind === "town" ? "Town" : "Area"} ·{" "}
                      {t.boundary
                        ? "mapped boundary"
                        : `${Math.round(t.radiusM / 100) / 10} km radius`}{" "}
                      · {t.centre.lat.toFixed(4)}, {t.centre.lng.toFixed(4)}
                    </p>
                  </div>
                  <StatusChip status={t.status} />
                </div>
                {editable ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(t.id)}
                    >
                      Edit
                    </Button>
                    {t.status === "active" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setStatus(t.id, "completed")}
                      >
                        Mark completed
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setStatus(t.id, "active")}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
