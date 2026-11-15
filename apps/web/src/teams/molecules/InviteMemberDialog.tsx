"use client";

import { findTeamInvitee } from "@/actions/teams/findTeamInvitee";
import { inviteTeamMember } from "@/actions/teams/inviteTeamMember";
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
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { personName } from "@abonten/core/personName";
import {
  TEAM_ROLES,
  isTeamRole,
  teamRoleNeedsIdCheck,
} from "@abonten/core/teams/roles";
import type { InviteTarget, TeamRoleCode } from "@abonten/types/teamType";
import type { TicketTransferRecipient } from "@abonten/types/ticketTransferType";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import TeamPersonAvatar from "../atoms/TeamPersonAvatar";
import { useRefreshTeams } from "../useTeams";

type Mode = "username" | "phone";

/**
 * An Owner invites someone, by username (their public name and photo show
 * before sending) or by phone number (only masked), in the role that covers
 * only what they need. They join when they accept.
 */
export default function InviteMemberDialog({
  teamId,
  open,
  onOpenChange,
}: {
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const toast = useToast();
  const refresh = useRefreshTeams();

  const [role, setRole] = useState<TeamRoleCode>("manager");
  const [mode, setMode] = useState<Mode>("username");
  const [value, setValue] = useState("");
  const [invitee, setInvitee] = useState<TicketTransferRecipient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRole("manager");
      setMode("username");
      setValue("");
      setInvitee(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const target = (): InviteTarget =>
    mode === "username"
      ? { kind: "username", username: value }
      : { kind: "phone", phone: value };

  const find = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    const res = await findTeamInvitee({ teamId, target: target() }).catch(
      actionUnreachable,
    );
    setBusy(false);
    if (res.status === 200 && "data" in res && res.data) {
      setInvitee(res.data);
    } else {
      setInvitee(null);
      setError(res.message ?? t("couldNotDo"));
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await inviteTeamMember({
      teamId,
      role,
      target: target(),
    }).catch(actionUnreachable);
    setBusy(false);
    if (res.status === 200) {
      toast.success(t("inviteSentToast"));
      refresh();
      onOpenChange(false);
    } else {
      setError(res.message ?? t("couldNotDo"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
          <DialogDescription>{t("inviteBody")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="team-invite-role">{t("roleLabel")}</Label>
          <Select
            id="team-invite-role"
            value={role}
            onChange={(e) => {
              if (isTeamRole(e.target.value)) setRole(e.target.value);
            }}
          >
            {TEAM_ROLES.map((r) => (
              <option key={r} value={r}>
                {t("role", { role: r })}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("roleHelp", { role })}
          </p>
          {teamRoleNeedsIdCheck(role) ? (
            <p className="text-xs text-muted-foreground">{t("idCheckNote")}</p>
          ) : null}
        </div>

        {invitee ? (
          <div className="space-y-3">
            {invitee.kind === "account" ? (
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <TeamPersonAvatar
                  publicId={invitee.person.avatarPublicId}
                  version={invitee.person.avatarVersion}
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {personName(tc, {
                      full_name: invitee.person.name,
                      username: invitee.person.username,
                    })}
                  </p>
                  {invitee.person.username ? (
                    <p className="truncate text-sm text-muted-foreground">
                      @{invitee.person.username}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p className="font-medium">{invitee.phoneMasked}</p>
                <p className="text-sm text-muted-foreground">
                  {t("phoneHint")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <fieldset className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <legend className="sr-only">{t("inviteBy")}</legend>
              {(["username", "phone"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    mode === m
                      ? "bg-background font-medium shadow"
                      : "text-muted-foreground"
                  }`}
                >
                  {m === "username" ? t("byUsername") : t("byPhone")}
                </button>
              ))}
            </fieldset>
            <Input
              value={value}
              inputMode={mode === "phone" ? "tel" : "text"}
              autoComplete={mode === "phone" ? "tel" : "off"}
              placeholder={
                mode === "username"
                  ? t("usernamePlaceholder")
                  : t("phonePlaceholder")
              }
              aria-label={mode === "username" ? t("byUsername") : t("byPhone")}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void find();
              }}
            />
          </div>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          {invitee ? (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setInvitee(null);
                  setError(null);
                }}
              >
                {t("change")}
              </Button>
              <Button disabled={busy} onClick={() => void send()}>
                {busy ? t("sending") : t("sendInvite")}
              </Button>
            </>
          ) : (
            <Button
              disabled={busy || !value.trim()}
              onClick={() => void find()}
            >
              {t("continue")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
