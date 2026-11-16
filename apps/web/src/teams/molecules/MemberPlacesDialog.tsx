"use client";

import { setTeamMemberPlaces } from "@/actions/teams/setTeamMemberPlaces";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * An Owner limits a Front desk or Door staff member to some of the team's
 * places (a chain of lounges); none chosen = all of them.
 */
export default function MemberPlacesDialog({
  teamId,
  member,
  places,
  open,
  onOpenChange,
  onSaved,
}: {
  teamId: string;
  member: { id: string; name: string; placeIds: string[] | null } | null;
  places: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("teams");
  const toast = useToast();
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setChosen(member?.placeIds ?? []);
  }, [open, member]);

  const toggle = (id: string) =>
    setChosen((now) =>
      now.includes(id) ? now.filter((p) => p !== id) : [...now, id],
    );

  const save = async () => {
    if (!member) return;
    setBusy(true);
    const res = await setTeamMemberPlaces({
      teamId,
      userId: member.id,
      placeIds: chosen,
    }).catch(actionUnreachable);
    setBusy(false);
    if (res.status === 200) {
      toast.success(t("placesSavedToast"));
      onOpenChange(false);
      onSaved();
    } else {
      toast.error(res.message ?? t("couldNotDo"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("placesTitle", { name: member?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("placesBody")}</DialogDescription>
        </DialogHeader>
        {places.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPlacesYet")}</p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {places.map((place) => (
              <li key={place.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={chosen.includes(place.id)}
                    onChange={() => toggle(place.id)}
                  />
                  <span>{place.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button disabled={busy || !member} onClick={() => void save()}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
