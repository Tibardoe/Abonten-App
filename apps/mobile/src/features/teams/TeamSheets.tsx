import { personName } from "@abonten/core/personName";
import { TEAM_ROLES, teamRoleNeedsIdCheck } from "@abonten/core/teams/roles";
import type { InviteTarget, TeamRoleCode } from "@abonten/types/teamType";
import type { TicketTransferRecipient } from "@abonten/types/ticketTransferType";
import {
  AppText,
  Avatar,
  Button,
  Chip,
  Icon,
  Input,
  type IoniconName,
  SegmentedTabs,
  Sheet,
  useToast,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { View } from "react-native";
import {
  useCreateTeam,
  useFindTeamInvitee,
  useInviteTeamMember,
} from "./useTeams";

// The sheets of the Teams screens: make a team, invite someone, choose a
// role. The native echo of the website's dialogs.

const ROLE_ICON: Record<TeamRoleCode, IoniconName> = {
  owner: "key-outline",
  finance: "wallet-outline",
  manager: "calendar-outline",
  content: "chatbubbles-outline",
  door: "qr-code-outline",
  front_desk: "storefront-outline",
};

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

/** One of the six roles, with what the chosen one covers. */
export function RoleChoice({
  value,
  onPick,
}: {
  value: TeamRoleCode;
  onPick: (role: TeamRoleCode) => void;
}) {
  const t = useTranslations("teams");
  return (
    <View className="gap-2">
      <AppText variant="bodyStrong">{t("roleLabel")}</AppText>
      <View className="flex-row flex-wrap gap-2">
        {TEAM_ROLES.map((role) => (
          <Chip
            key={role}
            label={t("role", { role })}
            selected={role === value}
            showCheck
            onPress={() => onPick(role)}
          />
        ))}
      </View>
      <View className="flex-row items-start gap-2 rounded-xl bg-muted p-3">
        <Icon name={ROLE_ICON[value]} size={18} tone="muted" />
        <AppText variant="small" className="flex-1">
          {t("roleHelp", { role: value })}
        </AppText>
      </View>
    </View>
  );
}

/** Makes a team: its own name and @username, with the person as Owner. */
export function CreateTeamSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (teamId: string) => void;
}) {
  const t = useTranslations("teams");
  const toast = useToast();
  const create = useCreateTeam();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName("");
    setUsername("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    setError(null);
    try {
      const res = await create.mutateAsync({
        name: name.trim(),
        username: username.trim().replace(/^@+/, ""),
      });
      if (res.status === 200 && res.data) {
        toast.success(t("createdToast"));
        const id = res.data.id;
        close();
        onCreated(id);
      } else {
        setError(res.message ?? t("couldNotDo"));
      }
    } catch {
      setError(t("couldNotDo"));
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("createTitle")}
      footer={
        <View className="gap-2">
          <SheetError error={error} />
          <Button
            title={create.isPending ? t("creating") : t("create")}
            loading={create.isPending}
            disabled={create.isPending || !name.trim() || !username.trim()}
            onPress={submit}
          />
        </View>
      }
    >
      <View className="gap-4">
        <AppText variant="small" tone="muted">
          {t("createBody")}
        </AppText>
        <Input
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
          placeholder={t("nameLabel")}
          accessibilityLabel={t("nameLabel")}
          maxLength={80}
          returnKeyType="next"
        />
        <View className="gap-1">
          <Input
            value={username}
            onChangeText={(v) => {
              setUsername(v.trim());
              setError(null);
            }}
            placeholder={t("usernamePlaceholder")}
            accessibilityLabel={t("usernameLabel")}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={31}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (name.trim() && username.trim()) void submit();
            }}
          />
          <AppText variant="meta">{t("usernameHint")}</AppText>
        </View>
      </View>
    </Sheet>
  );
}

type Mode = "username" | "phone";

/** An Owner invites someone, by username or phone number, in a role. */
export function InviteMemberSheet({
  open,
  onClose,
  teamId,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("core");
  const toast = useToast();
  const find = useFindTeamInvitee();
  const invite = useInviteTeamMember();
  const [role, setRole] = useState<TeamRoleCode>("manager");
  const [mode, setMode] = useState<Mode>("username");
  const [value, setValue] = useState("");
  const [invitee, setInvitee] = useState<TicketTransferRecipient | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setRole("manager");
    setMode("username");
    setValue("");
    setInvitee(null);
    setError(null);
    onClose();
  };

  const target = (): InviteTarget =>
    mode === "username"
      ? { kind: "username", username: value }
      : { kind: "phone", phone: value };

  const onFind = async () => {
    if (!value.trim()) return;
    setError(null);
    try {
      const res = await find.mutateAsync({ teamId, target: target() });
      if (res.status === 200 && res.data) setInvitee(res.data);
      else setError(res.message ?? t("couldNotDo"));
    } catch {
      setError(t("couldNotDo"));
    }
  };

  const onSend = async () => {
    setError(null);
    try {
      const res = await invite.mutateAsync({ teamId, role, target: target() });
      if (res.status === 200) {
        toast.success(t("inviteSentToast"));
        close();
      } else {
        setError(res.message ?? t("couldNotDo"));
      }
    } catch {
      setError(t("couldNotDo"));
    }
  };

  const busy = find.isPending || invite.isPending;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("inviteTitle")}
      onBack={invitee ? () => setInvitee(null) : undefined}
      footer={
        <View className="gap-2">
          <SheetError error={error} />
          {invitee ? (
            <Button
              title={invite.isPending ? t("sending") : t("sendInvite")}
              loading={invite.isPending}
              disabled={busy}
              onPress={onSend}
            />
          ) : (
            <Button
              title={t("continue")}
              loading={find.isPending}
              disabled={busy || !value.trim()}
              onPress={onFind}
            />
          )}
        </View>
      }
    >
      <View className="gap-4">
        <AppText variant="small" tone="muted">
          {t("inviteBody")}
        </AppText>
        <RoleChoice value={role} onPick={setRole} />
        {teamRoleNeedsIdCheck(role) ? (
          <AppText variant="meta">{t("idCheckNote")}</AppText>
        ) : null}
        {invitee ? (
          invitee.kind === "account" ? (
            <View className="flex-row items-center gap-3 rounded-xl border border-border p-3">
              <Avatar
                publicId={invitee.person.avatarPublicId}
                version={invitee.person.avatarVersion}
                size={44}
              />
              <View className="flex-1">
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {personName(tc, {
                    full_name: invitee.person.name,
                    username: invitee.person.username,
                  }) ?? ""}
                </AppText>
                {invitee.person.username ? (
                  <AppText variant="meta" numberOfLines={1}>
                    @{invitee.person.username}
                  </AppText>
                ) : null}
              </View>
            </View>
          ) : (
            <View className="gap-1 rounded-xl border border-border p-3">
              <AppText variant="bodyStrong">{invitee.phoneMasked}</AppText>
              <AppText variant="meta">{t("phoneHint")}</AppText>
            </View>
          )
        ) : (
          <View className="gap-3">
            <SegmentedTabs
              options={[
                { key: "username", label: t("byUsername") },
                { key: "phone", label: t("byPhone") },
              ]}
              value={mode}
              onChange={(next: Mode) => {
                setMode(next);
                setError(null);
              }}
            />
            <Input
              value={value}
              onChangeText={(text) => {
                setValue(text);
                setError(null);
              }}
              placeholder={
                mode === "username"
                  ? t("usernamePlaceholder")
                  : t("phonePlaceholder")
              }
              accessibilityLabel={
                mode === "username" ? t("byUsername") : t("byPhone")
              }
              keyboardType={mode === "phone" ? "phone-pad" : "default"}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={onFind}
            />
          </View>
        )}
      </View>
    </Sheet>
  );
}
