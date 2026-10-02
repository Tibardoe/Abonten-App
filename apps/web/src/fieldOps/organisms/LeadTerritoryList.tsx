"use client";

import { setFieldOpsLeadTerritoryStatus } from "@/actions/fieldOps/setFieldOpsLeadTerritoryStatus";
import { Button } from "@/components/ui/button";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import LeadTerritoryForm from "@/fieldOps/organisms/LeadTerritoryForm";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import type { FieldOpsTerritory } from "@abonten/types/fieldOps";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** The region's territories with edit / complete / reopen, plus the add form. */
export default function LeadTerritoryList({
  campaignId,
  placeContext,
  territories,
  editable,
}: {
  campaignId: string;
  placeContext: string;
  territories: FieldOpsTerritory[];
  editable: boolean;
}) {
  const t = useTranslations("fieldOps");

  const toast = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const towns = territories.filter((territory) => territory.kind === "town");

  const setStatus = (id: string, status: "active" | "completed") =>
    start(async () => {
      const res = await setFieldOpsLeadTerritoryStatus({
        campaignId,
        territoryId: id,
        status,
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message ?? t("saved"));
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTDoThat"));
      }
    });

  return (
    <div className="flex flex-col gap-4">
      {editable ? (
        adding ? (
          <LeadTerritoryForm
            campaignId={campaignId}
            placeContext={placeContext}
            towns={towns}
            onDone={() => setAdding(false)}
          />
        ) : (
          <Button onClick={() => setAdding(true)} className="w-full md:w-auto">
            {t("addATownOrArea")}
          </Button>
        )
      ) : null}

      {territories.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {t("noTerritoriesYet")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {territories.map((territory) =>
            editing === territory.id ? (
              <li key={territory.id}>
                <LeadTerritoryForm
                  campaignId={campaignId}
                  placeContext={placeContext}
                  towns={towns}
                  initial={territory}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={territory.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/field/territory/${territory.id}`}
                      className="font-medium hover:underline"
                    >
                      {territory.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {territory.kind === "town" ? t("town") : t("area")} ·{" "}
                      {territory.boundary
                        ? t("mappedBoundary")
                        : t("kmRadius", {
                            value: Math.round(territory.radiusM / 100) / 10,
                          })}{" "}
                      · {territory.centre.lat.toFixed(4)},{" "}
                      {territory.centre.lng.toFixed(4)}
                    </p>
                  </div>
                  <StatusChip status={territory.status} />
                </div>
                {editable ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(territory.id)}
                    >
                      {t("edit")}
                    </Button>
                    {territory.status === "active" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setStatus(territory.id, "completed")}
                      >
                        {t("markCompleted")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setStatus(territory.id, "active")}
                      >
                        {t("reopen")}
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
