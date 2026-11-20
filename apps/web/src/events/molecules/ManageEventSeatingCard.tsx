"use client";

import getEventSeating from "@/actions/getEventSeating";
import saveSeatingPlan from "@/actions/saveSeatingPlan";
import setEventSeating from "@/actions/setEventSeating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import {
  type SeatingRow,
  rowLabelsBetween,
  seatingPlanProblem,
  seatingProblemMessage,
  sectionSeatCount,
} from "@abonten/core/seating";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";

type SectionDraft = {
  id: string | null;
  name: string;
  /** The section's rows as saved (kept unless a new range is typed). */
  rows: SeatingRow[];
  from: string;
  to: string;
  seats: string;
};

function draftRows(section: SectionDraft): SeatingRow[] | null {
  if (!section.from && !section.to && section.rows.length > 0) {
    return section.rows;
  }
  const labels = rowLabelsBetween(section.from, section.to);
  const seats = Number(section.seats);
  if (!labels || !Number.isInteger(seats)) return null;
  return labels.map((label) => ({ label, seats }));
}

/**
 * Manage › Details › Seating (docs/architecture/assigned-seats.md): describe
 * the venue once (sections, rows, seats), then give each ticket type a
 * section. When a ticket is issued, Abonten gives it the best seat left in
 * its section, an order side by side; the seat is on the ticket and the
 * door list. Locked once the event has its first ticket.
 */
export default function ManageEventSeatingCard({
  eventId,
}: { eventId: string }) {
  const t = useTranslations("events");
  const tc = useTranslations("core");
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["event-seating", eventId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getEventSeating(eventId),
    staleTime: 30_000,
  });
  const setup = data?.status === 200 && "data" in data ? data.data : null;
  const [pending, start] = useTransition();

  const [planId, setPlanId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [planName, setPlanName] = useState("");
  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!setup) return;
    setPlanId(setup.planId ?? setup.plans[0]?.id ?? null);
    setMapping(
      Object.fromEntries(
        setup.ticketTypes.map((type) => [type.id, type.sectionId]),
      ),
    );
  }, [setup]);

  const plan = setup?.plans.find((p) => p.id === planId) ?? null;

  const startEditing = (fresh: boolean) => {
    setEditing(true);
    if (fresh || !plan) {
      setPlanName("");
      setSections([
        { id: null, name: "", rows: [], from: "A", to: "J", seats: "20" },
      ]);
      return;
    }
    setPlanName(plan.name);
    setSections(
      plan.sections.map((s) => ({
        id: s.id,
        name: s.name,
        rows: s.rows,
        from: "",
        to: "",
        seats: "",
      })),
    );
  };

  const draftPlan = useMemo(
    () => ({
      name: planName,
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        rows: draftRows(s) ?? [],
      })),
    }),
    [planName, sections],
  );
  const draftProblem = editing ? seatingPlanProblem(draftPlan) : null;

  const savePlan = () =>
    start(async () => {
      const res = await saveSeatingPlan({
        planId: sections.some((s) => s.id) ? (plan?.id ?? null) : null,
        ...draftPlan,
      }).catch(actionUnreachable);
      if (res.status === 200 && "data" in res) {
        toast.success(res.message);
        setEditing(false);
        setPlanId(res.data.planId);
        await qc.invalidateQueries({ queryKey: key });
      } else {
        toast.error(res.message ?? t("couldNotSaveSeating"));
      }
    });

  const saveSeating = (nextPlan: string | null) =>
    start(async () => {
      const res = await setEventSeating({
        eventId,
        planId: nextPlan,
        sections: nextPlan ? mapping : {},
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message);
        await qc.invalidateQueries({ queryKey: key });
      } else {
        toast.error(res.message ?? t("couldNotSaveSeating"));
      }
    });

  if (!setup) return null;
  const locked = setup.locked;

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div>
        <h2 className="font-semibold text-lg">{t("seatingTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {locked ? t("seatingLockedNote") : t("seatingIntro")}
        </p>
      </div>

      {!editing && (
        <div className="space-y-3">
          {setup.plans.length > 0 ? (
            <div className="space-y-1">
              <label
                htmlFor="seating-plan"
                className="text-sm text-muted-foreground"
              >
                {t("seatingPlan")}
              </label>
              <select
                id="seating-plan"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={planId ?? ""}
                disabled={locked}
                onChange={(e) => setPlanId(e.target.value || null)}
              >
                {setup.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("noSeatingPlanYet")}
            </p>
          )}

          {plan && (
            <ul className="space-y-1 text-sm">
              {plan.sections.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span>{s.name}</span>
                  <span className="text-muted-foreground">
                    {t("sectionSummary", {
                      rows: s.rows.length,
                      seats: s.seatCount,
                      given: setup.seatsGiven[s.id] ?? 0,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!locked && (
            <div className="flex flex-wrap gap-2">
              {plan && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => startEditing(false)}
                >
                  {t("editSeatingPlan")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => startEditing(true)}
              >
                {t("newSeatingPlan")}
              </Button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="plan-name"
              className="text-sm text-muted-foreground"
            >
              {t("seatingPlanName")}
            </label>
            <Input
              id="plan-name"
              value={planName}
              placeholder={t("seatingPlanNamePlaceholder")}
              onChange={(e) => setPlanName(e.target.value)}
            />
          </div>

          {sections.map((section, i) => {
            const rows = draftRows(section);
            const patch = (next: Partial<SectionDraft>) =>
              setSections((prev) =>
                prev.map((s, idx) => (idx === i ? { ...s, ...next } : s)),
              );
            return (
              <div
                key={section.id ?? `new-${i}`}
                className="space-y-2 rounded-md border border-border p-3"
              >
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <label
                      htmlFor={`section-name-${i}`}
                      className="text-sm text-muted-foreground"
                    >
                      {t("sectionName")}
                    </label>
                    <Input
                      id={`section-name-${i}`}
                      value={section.name}
                      placeholder={t("sectionNamePlaceholder")}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setSections((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    {t("remove")}
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    aria-label={t("rowsFrom")}
                    placeholder={t("rowsFrom")}
                    value={section.from}
                    onChange={(e) => patch({ from: e.target.value })}
                  />
                  <Input
                    aria-label={t("rowsTo")}
                    placeholder={t("rowsTo")}
                    value={section.to}
                    onChange={(e) => patch({ to: e.target.value })}
                  />
                  <Input
                    aria-label={t("seatsPerRow")}
                    placeholder={t("seatsPerRow")}
                    type="number"
                    min={1}
                    value={section.seats}
                    onChange={(e) => patch({ seats: e.target.value })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {rows
                    ? t("sectionSummaryShort", {
                        rows: rows.length,
                        seats: sectionSeatCount(rows),
                      })
                    : t("rowsHelp")}
                </p>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSections((prev) => [
                ...prev,
                {
                  id: null,
                  name: "",
                  rows: [],
                  from: "A",
                  to: "J",
                  seats: "20",
                },
              ])
            }
          >
            {t("addSection")}
          </Button>

          {draftProblem && (
            <p role="alert" className="text-sm text-destructive">
              {seatingProblemMessage(tc, draftProblem)}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              disabled={pending || !!draftProblem}
              onClick={savePlan}
            >
              {t("saveSeatingPlan")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {!editing && plan && (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {t("whichSectionEachTicketSells")}
          </p>
          {setup.ticketTypes.map((type) => {
            const sectionId = mapping[type.id] ?? null;
            const section = plan.sections.find((s) => s.id === sectionId);
            return (
              <div key={type.id} className="flex items-center gap-3">
                <span className="w-1/3 text-sm">
                  {ticketTypeLabel(tc, type.type)}
                </span>
                <select
                  aria-label={t("sectionFor", {
                    type: ticketTypeLabel(tc, type.type),
                  })}
                  className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  value={sectionId ?? ""}
                  disabled={locked}
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      [type.id]: e.target.value || null,
                    }))
                  }
                >
                  <option value="">{t("notSeated")}</option>
                  {plan.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {section && (
                  <span className="text-xs text-muted-foreground">
                    {t("sellsSeats", { seats: section.seatCount })}
                  </span>
                )}
              </div>
            );
          })}

          {!locked && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={pending}
                onClick={() => saveSeating(planId)}
              >
                {t("saveSeating")}
              </Button>
              {setup.planId && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => saveSeating(null)}
                >
                  {t("stopSeating")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
