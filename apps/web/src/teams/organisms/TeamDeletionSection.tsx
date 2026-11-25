"use client";

import { approveTeamDeletion } from "@/actions/teams/approveTeamDeletion";
import { cancelTeamDeletion } from "@/actions/teams/cancelTeamDeletion";
import { requestTeamDeletion } from "@/actions/teams/requestTeamDeletion";
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
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatDate } from "@abonten/core/i18n/format";
import { personName } from "@abonten/core/personName";
import {
  ownersStillToApprove,
  teamNameConfirmed,
} from "@abonten/core/teams/teamDeletion";
import type { TeamDetail } from "@abonten/types/teamType";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRefreshTeams } from "../useTeams";

type Envelope = {
  status: number;
  message?: string;
  data?: { state?: string } | unknown;
};

/**
 * Deleting the team, for its Owners (docs/architecture/team-accounts.md
 * §4o): every Owner has to agree. With no request open, an Owner asks
 * (typing the team's name); with one open, each Owner sees who asked, how
 * many have approved and who is still to, and approves or stops it.
 */
export default function TeamDeletionSection({
  detail,
  teamName,
}: {
  detail: TeamDetail;
  teamName: string;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const refresh = useRefreshTeams();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = detail.deletion ?? null;
  const team = detail.team;

  // After a step: the team is gone (back to Teams) or the page refreshes.
  const settle = (res: Envelope) => {
    if (res.status !== 200) {
      toast.error(res.message ?? t("couldNotDo"));
      refresh();
      return false;
    }
    toast.success(res.message ?? t("deleteTitle"));
    const state = (res.data as { state?: string } | undefined)?.state;
    if (state === "deleted") {
      refresh();
      router.push("/settings/teams");
    } else {
      refresh();
    }
    return true;
  };

  const approve = async () => {
    if (!request) return;
    const ok = await confirm({
      title: t("deleteApproveTitle", { team: teamName }),
      message: t("deleteApproveBody"),
      confirmLabel: t("deleteApprove"),
    });
    if (!ok) return;
    setBusy(true);
    const res = await approveTeamDeletion({
      teamId: team.id,
      requestId: request.id,
    }).catch(actionUnreachable);
    setBusy(false);
    settle(res);
  };

  const stop = async () => {
    if (!request) return;
    const ok = await confirm({
      title: t("deleteStopTitle", { team: teamName }),
      message: t("deleteStopBody"),
      confirmLabel: t("deleteStop"),
    });
    if (!ok) return;
    setBusy(true);
    const res = await cancelTeamDeletion({
      teamId: team.id,
      requestId: request.id,
    }).catch(actionUnreachable);
    setBusy(false);
    settle(res);
  };

  const otherOwners = Math.max(
    0,
    detail.members.filter((m) => m.role === "owner").length - 1,
  );

  return (
    <section className="space-y-3 rounded-xl border border-destructive/40 p-4">
      <h3 className="font-semibold">{t("deleteTitle")}</h3>
      {request ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium">
            {request.requestedBy
              ? t("deletePendingTitle", {
                  actor:
                    personName(tc, {
                      full_name: request.requestedBy.name,
                      username: request.requestedBy.username,
                    }) ?? "",
                })
              : t("deletePendingTitleNoActor")}
          </p>
          <p>
            {t("deleteWaiting", {
              waiting: ownersStillToApprove(request.owners, request.approvals),
              owners: request.owners,
            })}
          </p>
          {request.waitingFor.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">
                {t("deleteWaitingFor")}
              </span>
              {request.waitingFor.map((owner) => (
                <span
                  key={owner.id}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs"
                >
                  {personName(tc, {
                    full_name: owner.name,
                    username: owner.username,
                  })}
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-muted-foreground">
            {t("deleteEndsOn", {
              date: formatDate(request.expiresAt, locale),
            })}
          </p>
          {request.approvedByMe ? (
            <p className="text-muted-foreground">{t("deleteYouApproved")}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!request.approvedByMe ? (
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void approve()}
              >
                {t("deleteApprove")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void stop()}
            >
              {t("deleteStop")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("deleteSignInNote")}
          </p>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{t("deleteIntro")}</p>
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/60 text-destructive hover:bg-destructive/10"
            onClick={() => setAsking(true)}
          >
            {t("deleteOpen")}
          </Button>
        </div>
      )}
      <DeleteTeamDialog
        teamId={team.id}
        teamName={teamName}
        otherOwners={otherOwners}
        open={asking}
        onOpenChange={setAsking}
        onDone={settle}
      />
    </section>
  );
}

function DeleteTeamDialog({
  teamId,
  teamName,
  otherOwners,
  open,
  onOpenChange,
  onDone,
}: {
  teamId: string;
  teamName: string;
  otherOwners: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (res: Envelope) => boolean;
}) {
  const t = useTranslations("teams");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matches = teamNameConfirmed(typed, teamName);

  useEffect(() => {
    if (open) {
      setTyped("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await requestTeamDeletion({
      teamId,
      confirmName: typed,
    }).catch(actionUnreachable);
    setBusy(false);
    if (res.status === 200) {
      onOpenChange(false);
      onDone(res);
    } else {
      setError(res.message ?? t("couldNotDo"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("deleteDialogTitle", { team: teamName })}
          </DialogTitle>
          <DialogDescription>{t("deleteIntro")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="font-medium">{t("deleteWhatHappens")}</p>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>{t("deleteEffectMembers")}</li>
            <li>{t("deleteEffectListings")}</li>
            <li>{t("deleteEffectProfile")}</li>
            <li>{t("deleteEffectMoney")}</li>
          </ul>
          <p>{t("deleteEffectOwners", { others: otherOwners })}</p>
          <div className="space-y-1.5">
            <Label htmlFor="team-delete-confirm">
              {t("deleteConfirmLabel", { team: teamName })}
            </Label>
            <Input
              id="team-delete-confirm"
              value={typed}
              autoComplete="off"
              onChange={(e) => {
                setTyped(e.target.value);
                setError(null);
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("deleteSignInNote")}
          </p>
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
            variant="destructive"
            disabled={busy || !matches}
            onClick={() => void submit()}
          >
            {busy
              ? t("deleting")
              : otherOwners === 0
                ? t("deleteNow")
                : t("deleteAsk")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
