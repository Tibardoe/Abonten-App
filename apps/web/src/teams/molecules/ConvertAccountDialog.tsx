"use client";

import { convertAccountToTeam } from "@/actions/teams/convertAccountToTeam";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUserDetails } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
import AdultConfirm from "@/teams/atoms/AdultConfirm";
import TermsConfirm from "@/teams/atoms/TermsConfirm";
import { actionUnreachable } from "@/utils/actionUnreachable";
import type { TeamTerms } from "@abonten/types/teamType";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * "Make this a team" (X8): says what moves and what stays, takes the team's
 * name (the person's own by default) and, once confirmed, moves the
 * person's organizer and place work to a new team that keeps their handle.
 */
export default function ConvertAccountDialog({
  open,
  onOpenChange,
  terms = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The published team terms to accept (N4), if any. */
  terms?: TeamTerms | null;
}) {
  const t = useTranslations("teams");
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: details } = useCurrentUserDetails();
  const [name, setName] = useState("");
  const [adult, setAdult] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fullName = details?.full_name ?? "";
  const handle = details?.username ?? "";

  useEffect(() => {
    if (open) {
      setName(fullName);
      setAdult(false);
      setAccepted(false);
      setError(null);
      setBusy(false);
    }
  }, [open, fullName]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await convertAccountToTeam({
      name,
      adult,
      termsVersion: terms?.version ?? null,
    }).catch(actionUnreachable);
    setBusy(false);
    if (res.status === 200 && "data" in res && res.data) {
      toast.success(
        t("convertedToast", {
          team: res.data.team.name ?? name,
          username: res.data.personUsername,
        }),
      );
      // X42: the badge was an individual's, or moved under a new name.
      if (res.data.badgeBackInReview) toast.info(t("convertedBadgeInReview"));
      onOpenChange(false);
      // The person's handle, their listings and their money all changed.
      await qc.resetQueries();
      router.push(`/settings/teams/${res.data.team.id}`);
      router.refresh();
    } else {
      setError(res.message ?? t("couldNotDo"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("convertTitle")}</DialogTitle>
          <DialogDescription>{t("convertBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="convert-team-name">{t("nameLabel")}</Label>
            <Input
              id="convert-team-name"
              value={name}
              maxLength={80}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>
          {handle ? (
            <p className="text-sm text-muted-foreground">
              {t("convertConfirm", { handle })}
            </p>
          ) : null}
          <AdultConfirm
            id="convert-adult"
            checked={adult}
            onChange={setAdult}
          />
          {terms ? (
            <TermsConfirm
              id="convert-terms"
              terms={terms}
              checked={accepted}
              onChange={setAccepted}
            />
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={busy || !name.trim() || !adult || (!!terms && !accepted)}
            onClick={() => void submit()}
          >
            {busy ? t("converting") : t("convertAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
