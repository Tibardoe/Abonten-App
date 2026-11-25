"use client";

import { updateTeamProfile } from "@/actions/teams/updateTeamProfile";
import UsernameAvailabilityHint from "@/components/molecules/UsernameAvailabilityHint";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";
import { actionUnreachable } from "@/utils/actionUnreachable";
import {
  LISTER_SOCIAL_NETWORKS,
  LISTER_SOCIAL_NETWORK_NAME,
  type ListerSocialNetwork,
  listerSocialLinkFields,
} from "@abonten/core/social/listerSocialLinks";
import {
  normalizeUsernameInput,
  sameUsername,
} from "@abonten/core/usernames/usernames";
import type { TeamDetail, TeamProfilePatch } from "@abonten/types/teamType";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRefreshTeams } from "../useTeams";

type Fields = {
  username: string;
  bio: string;
  website: string;
  social: Record<ListerSocialNetwork, string>;
};

function initialFields(detail: TeamDetail): Fields {
  return {
    username: detail.team.username ?? "",
    bio: detail.profile?.bio ?? "",
    website: detail.profile?.website ?? "",
    social: listerSocialLinkFields(detail.profile?.socialLinks ?? null),
  };
}

/**
 * An Owner edits the team's public profile: username (said taken as they
 * type, with free ones to tap), bio, website and social accounts. Only
 * what changed is sent; the name keeps its own Rename.
 */
export default function EditTeamProfileDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: TeamDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("teams");
  const toast = useToast();
  const refresh = useRefreshTeams();
  const [fields, setFields] = useState<Fields>(() => initialFields(detail));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A fresh form each time it opens (a refetch while open keeps the typing).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on open
  useEffect(() => {
    if (open) {
      setFields(initialFields(detail));
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const current = detail.team.username ?? "";
  const usernameCheck = useUsernameAvailability({
    username: fields.username,
    current,
    teamId: detail.team.id,
  });
  const usernameChanged =
    !!normalizeUsernameInput(fields.username) &&
    !sameUsername(normalizeUsernameInput(fields.username), current);

  const patch = (): TeamProfilePatch => {
    const start = initialFields(detail);
    const out: TeamProfilePatch = {};
    const handle = normalizeUsernameInput(fields.username);
    if (handle !== start.username) out.username = handle;
    if (fields.bio.trim() !== start.bio) out.bio = fields.bio.trim();
    if (fields.website.trim() !== start.website) {
      out.website = fields.website.trim();
    }
    if (
      LISTER_SOCIAL_NETWORKS.some(
        (n) => fields.social[n].trim() !== start.social[n],
      )
    ) {
      out.socialLinks = Object.fromEntries(
        LISTER_SOCIAL_NETWORKS.map((n) => [n, fields.social[n].trim()]),
      );
    }
    return out;
  };
  const changes = patch();
  const nothingChanged = Object.keys(changes).length === 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await updateTeamProfile({
      teamId: detail.team.id,
      ...changes,
    }).catch(actionUnreachable);
    setBusy(false);
    if (res.status === 200) {
      toast.success(res.message ?? t("editProfile"));
      refresh();
      onOpenChange(false);
    } else {
      setError(res.message ?? t("couldNotDo"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("profileTitle")}</DialogTitle>
          <DialogDescription>{t("profileBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-profile-username">{t("usernameLabel")}</Label>
            <Input
              id="team-profile-username"
              value={fields.username}
              maxLength={31}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("usernamePlaceholder")}
              onChange={(e) => {
                setFields((f) => ({ ...f, username: e.target.value.trim() }));
                setError(null);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("usernameHint")}</p>
            <UsernameAvailabilityHint
              check={usernameCheck}
              onPick={(handle) => {
                setFields((f) => ({ ...f, username: handle }));
                setError(null);
              }}
            />
            {usernameChanged ? (
              <p className="text-xs text-muted-foreground">
                {t("usernameMoveNote")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-profile-bio">{t("bioLabel")}</Label>
            <Textarea
              id="team-profile-bio"
              value={fields.bio}
              maxLength={160}
              rows={3}
              onChange={(e) => {
                setFields((f) => ({ ...f, bio: e.target.value }));
                setError(null);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("bioHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-profile-website">{t("websiteLabel")}</Label>
            <Input
              id="team-profile-website"
              value={fields.website}
              maxLength={300}
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setFields((f) => ({ ...f, website: e.target.value }));
                setError(null);
              }}
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t("socialTitle")}</legend>
            <p className="text-xs text-muted-foreground">{t("socialHint")}</p>
            {LISTER_SOCIAL_NETWORKS.map((network) => (
              <div key={network} className="space-y-1.5">
                <Label htmlFor={`team-profile-${network}`}>
                  {LISTER_SOCIAL_NETWORK_NAME[network]}
                </Label>
                <Input
                  id={`team-profile-${network}`}
                  value={fields.social[network]}
                  maxLength={200}
                  placeholder={t("socialPlaceholder")}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFields((f) => ({
                      ...f,
                      social: { ...f.social, [network]: value },
                    }));
                    setError(null);
                  }}
                />
              </div>
            ))}
          </fieldset>
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
            disabled={busy || nothingChanged || usernameCheck.state === "taken"}
            onClick={() => void save()}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
