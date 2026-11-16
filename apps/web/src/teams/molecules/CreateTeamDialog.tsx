"use client";

import { createTeam } from "@/actions/teams/createTeam";
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
import { useToast } from "@/hooks/useToast";
import AdultConfirm from "@/teams/atoms/AdultConfirm";
import TermsConfirm from "@/teams/atoms/TermsConfirm";
import { actionUnreachable } from "@/utils/actionUnreachable";
import type { TeamTerms } from "@abonten/types/teamType";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRefreshTeams } from "../useTeams";

/**
 * Makes a team: its own name and @username, with the person as its first
 * Owner. The team then has its own page, where they invite the others.
 */
export default function CreateTeamDialog({
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
  const refresh = useRefreshTeams();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [adult, setAdult] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = adult && (!terms || accepted);

  useEffect(() => {
    if (open) {
      setName("");
      setUsername("");
      setAdult(false);
      setAccepted(false);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await createTeam({
      name,
      username: username.replace(/^@+/, ""),
      adult,
      termsVersion: terms?.version ?? null,
    }).catch(actionUnreachable);
    setBusy(false);
    if (res.status === 200 && "data" in res && res.data) {
      toast.success(t("createdToast"));
      refresh();
      onOpenChange(false);
      router.push(`/settings/teams/${res.data.id}`);
    } else {
      setError(res.message ?? t("couldNotDo"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">{t("nameLabel")}</Label>
            <Input
              id="team-name"
              value={name}
              maxLength={80}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-username">{t("usernameLabel")}</Label>
            <Input
              id="team-username"
              value={username}
              maxLength={31}
              autoComplete="off"
              placeholder={t("usernamePlaceholder")}
              onChange={(e) => {
                setUsername(e.target.value.trim());
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && username && ready) {
                  void submit();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">{t("usernameHint")}</p>
          </div>
          <AdultConfirm checked={adult} onChange={setAdult} />
          {terms ? (
            <TermsConfirm
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
            disabled={busy || !name.trim() || !username || !ready}
            onClick={() => void submit()}
          >
            {busy ? t("creating") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
