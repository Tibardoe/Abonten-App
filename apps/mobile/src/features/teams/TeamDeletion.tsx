import { formatDateTime } from "@abonten/core/i18n/format";
import { personName } from "@abonten/core/personName";
import { teamNameConfirmed } from "@abonten/core/teams/teamDeletion";
import type {
  TeamDeletionOutcome,
  TeamDeletionRequest,
} from "@abonten/types/teamType";
import {
  AppText,
  Button,
  Field,
  Icon,
  Input,
  Sheet,
  Tag,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { View } from "react-native";
import {
  useApproveTeamDeletion,
  useCancelTeamDeletion,
  useRequestTeamDeletion,
} from "./useTeams";

// Deleting a team, for its Owners (docs/architecture/team-accounts.md §4o):
// every active Owner agrees, each after a fresh sign-in, and the one who
// asks first types the team's name. While a request waits, the card says
// how many Owners have approved and who is still to; any Owner may stop
// it. The native echo of the website's TeamDeletionSection; both go
// through @abonten/services/teams/teamDeletionCore, which decides.

type Envelope = {
  status: number;
  message?: string;
  data?: TeamDeletionOutcome;
};

/** A yes/no question in a sheet (the app's confirm, not a system alert). */
function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("teams");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <View className="gap-2">
          <Button
            title={confirmLabel}
            variant="destructive"
            loading={busy}
            disabled={busy}
            onPress={onConfirm}
          />
          <Button
            title={t("cancel")}
            variant="outline"
            disabled={busy}
            onPress={onClose}
          />
        </View>
      }
    >
      <AppText variant="small">{body}</AppText>
    </Sheet>
  );
}

function SheetError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name="alert-circle" size={15} tone="destructive" />
      <AppText variant="small" tone="error" className="flex-1">
        {error}
      </AppText>
    </View>
  );
}

export function TeamDeletionSection({
  teamId,
  teamName,
  otherOwners,
  deletion,
  onDeleted,
}: {
  teamId: string;
  teamName: string;
  /** Active Owners besides the viewer (all must approve). */
  otherOwners: number;
  deletion: TeamDeletionRequest | null;
  /** The team is gone: leave its page. */
  onDeleted: () => void;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const { locale } = useLocale();
  const toast = useToast();
  const request = useRequestTeamDeletion();
  const approve = useApproveTeamDeletion();
  const stop = useCancelTeamDeletion();
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"approve" | "stop" | null>(null);

  /** One answer for every step: deleted, still waiting, or refused. */
  const settle = (res: Envelope): boolean => {
    if (res.status === 200) {
      if (res.message) toast.success(res.message);
      if (res.data?.state === "deleted") onDeleted();
      return true;
    }
    toast.error(res.message ?? t("couldNotDo"));
    return false;
  };

  const ask = async () => {
    setError(null);
    try {
      const res = await request.mutateAsync({ teamId, confirmName: typed });
      if (res.status === 200) {
        settle(res);
        setAsking(false);
        setTyped("");
      } else {
        // Shown in the sheet: sign in again, a blocker, a name mismatch.
        setError(res.message ?? t("couldNotDo"));
      }
    } catch {
      setError(t("couldNotDo"));
    }
  };

  const decide = async () => {
    if (!deletion || !confirm) return;
    try {
      const res =
        confirm === "approve"
          ? await approve.mutateAsync({ teamId, requestId: deletion.id })
          : await stop.mutateAsync({ teamId, requestId: deletion.id });
      settle(res);
    } catch {
      toast.error(t("couldNotDo"));
    }
    setConfirm(null);
  };

  const sure = teamNameConfirmed(typed, teamName);

  return (
    <View className="gap-3 rounded-xl border border-border p-4">
      <AppText variant="sectionHeading">{t("deleteTitle")}</AppText>
      {deletion ? (
        <View className="gap-2">
          <AppText variant="bodyStrong">
            {deletion.requestedBy
              ? t("deletePendingTitle", {
                  actor:
                    personName(tc, {
                      full_name: deletion.requestedBy.name,
                      username: deletion.requestedBy.username,
                    }) ?? "",
                })
              : t("deletePendingTitleNoActor")}
          </AppText>
          <AppText variant="small">
            {t("deleteWaiting", {
              waiting: Math.max(0, deletion.owners - deletion.approvals),
              owners: deletion.owners,
            })}
          </AppText>
          {deletion.waitingFor.length > 0 ? (
            <View className="gap-1.5">
              <AppText variant="caption">{t("deleteWaitingFor")}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {deletion.waitingFor.map((owner) => (
                  <Tag
                    key={owner.id}
                    label={
                      personName(tc, {
                        full_name: owner.name,
                        username: owner.username,
                      }) ?? ""
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}
          <AppText variant="caption">
            {t("deleteEndsOn", {
              date: formatDateTime(deletion.expiresAt, locale),
            })}
          </AppText>
          {deletion.approvedByMe ? (
            <AppText variant="small" tone="muted">
              {t("deleteYouApproved")}
            </AppText>
          ) : (
            <Button
              title={t("deleteApprove")}
              variant="destructive"
              size="sm"
              onPress={() => setConfirm("approve")}
            />
          )}
          <Button
            title={t("deleteStop")}
            variant="outline"
            size="sm"
            onPress={() => setConfirm("stop")}
          />
        </View>
      ) : (
        <View className="gap-2">
          <AppText variant="small" tone="muted">
            {t("deleteIntro")}
          </AppText>
          <Button
            title={t("deleteOpen")}
            variant="outline"
            size="sm"
            leftIcon="trash-outline"
            onPress={() => {
              setTyped("");
              setError(null);
              setAsking(true);
            }}
          />
        </View>
      )}

      <Sheet
        open={asking}
        onClose={() => {
          if (!request.isPending) setAsking(false);
        }}
        title={t("deleteDialogTitle", { team: teamName })}
        maxHeightRatio={0.92}
        footer={
          <View className="gap-2">
            <SheetError error={error} />
            <Button
              title={
                request.isPending
                  ? t("deleting")
                  : otherOwners > 0
                    ? t("deleteAsk")
                    : t("deleteNow")
              }
              variant="destructive"
              loading={request.isPending}
              disabled={request.isPending || !sure}
              onPress={ask}
            />
          </View>
        }
      >
        <View className="gap-3">
          <AppText variant="bodyStrong">{t("deleteWhatHappens")}</AppText>
          {(
            [
              "deleteEffectMembers",
              "deleteEffectListings",
              "deleteEffectProfile",
              "deleteEffectMoney",
            ] as const
          ).map((key) => (
            <View key={key} className="flex-row items-start gap-2">
              <Icon name="ellipse" size={6} tone="muted" />
              <AppText variant="small" className="flex-1">
                {t(key)}
              </AppText>
            </View>
          ))}
          <AppText variant="small" className="font-semibold">
            {t("deleteEffectOwners", { others: otherOwners })}
          </AppText>
          <Field label={t("deleteConfirmLabel", { team: teamName })}>
            <Input
              value={typed}
              onChangeText={(v) => {
                setTyped(v);
                setError(null);
              }}
              accessibilityLabel={t("deleteConfirmLabel", { team: teamName })}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={teamName}
            />
          </Field>
          <AppText variant="caption">{t("deleteSignInNote")}</AppText>
        </View>
      </Sheet>

      <ConfirmSheet
        open={confirm !== null}
        title={
          confirm === "approve"
            ? t("deleteApproveTitle", { team: teamName })
            : t("deleteStopTitle", { team: teamName })
        }
        body={
          confirm === "approve" ? t("deleteApproveBody") : t("deleteStopBody")
        }
        confirmLabel={
          confirm === "approve" ? t("deleteApprove") : t("deleteStop")
        }
        busy={approve.isPending || stop.isPending}
        onConfirm={decide}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}
