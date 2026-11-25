import { UsernameHint } from "@/components/profile/UsernameHint";
import { useUsernameCheck } from "@/features/profile/useUsernameCheck";
import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import {
  LISTER_SOCIAL_NETWORKS,
  LISTER_SOCIAL_NETWORK_NAME,
  type ListerSocialNetwork,
  listerSocialLinkFields,
} from "@abonten/core/social/listerSocialLinks";
import { normalizeUsernameInput } from "@abonten/core/usernames/usernames";
import type { TeamProfile, TeamProfilePatch } from "@abonten/types/teamType";
import {
  AppText,
  Button,
  Field,
  Icon,
  Input,
  Sheet,
  useToast,
} from "@abonten/ui-native";
import { translatorFor, useTranslations } from "@abonten/ui-native/i18n";
import { updateTeamProfileSchema } from "@abonten/validation/teamSchemas";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useSaveTeamPhoto, useUpdateTeamProfile } from "./useTeams";

// The team's public profile, for its Owners (docs/architecture/
// team-accounts.md §4n): username, bio, website and social accounts in one
// sheet, and the photo uploaded straight to the team's own folder. The name
// keeps its own Rename sheet (a Verified team's new name goes back to
// review). The native echo of the website's EditTeamProfileDialog; both go
// through @abonten/services/teams/teamProfileCore.

type Form = {
  username: string;
  bio: string;
  website: string;
} & Record<ListerSocialNetwork, string>;

function formOf(username: string, profile: TeamProfile | null): Form {
  return {
    username,
    bio: profile?.bio ?? "",
    website: profile?.website ?? "",
    ...listerSocialLinkFields(profile?.socialLinks ?? null),
  };
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

export function TeamProfileSheet({
  open,
  onClose,
  teamId,
  username,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  /** The team's handle now. */
  username: string;
  profile: TeamProfile | null;
}) {
  const t = useTranslations("teams");
  const toast = useToast();
  const update = useUpdateTeamProfile();
  const [form, setForm] = useState<Form>(() => formOf(username, profile));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const check = useUsernameCheck(form.username, {
    current: username,
    teamId,
    enabled: open,
  });

  // Opening starts from what is saved now; a refetch while the sheet is
  // open never throws away what the Owner is typing.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setForm(formOf(username, profile));
      setErrors({});
      setError(null);
    }
    wasOpen.current = open;
  }, [open, username, profile]);

  const set = (key: keyof Form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  const saved = formOf(username, profile);
  const handle = normalizeUsernameInput(form.username);
  // A change of case is a change too (the handle is shown as typed).
  const usernameChanged = handle !== username;
  const linksChanged = LISTER_SOCIAL_NETWORKS.some(
    (n) => form[n].trim() !== saved[n],
  );
  const patch: TeamProfilePatch = {
    ...(usernameChanged ? { username: handle } : {}),
    ...(form.bio.trim() !== saved.bio ? { bio: form.bio } : {}),
    ...(form.website.trim() !== saved.website ? { website: form.website } : {}),
    ...(linksChanged
      ? {
          socialLinks: Object.fromEntries(
            LISTER_SOCIAL_NETWORKS.map((n) => [n, form[n].trim()]),
          ),
        }
      : {}),
  };
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    const parsed = updateTeamProfileSchema.safeParse({ teamId, ...patch });
    if (!parsed.success) {
      const next: Partial<Record<keyof Form, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Form;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setError(null);
    try {
      const res = await update.mutateAsync({ teamId, patch });
      if (res.status === 200) {
        if (res.message) toast.success(res.message);
        onClose();
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
      onClose={onClose}
      title={t("profileTitle")}
      maxHeightRatio={0.92}
      footer={
        <View className="gap-2">
          <SheetError error={error} />
          <Button
            title={t("save")}
            loading={update.isPending}
            disabled={update.isPending || !dirty}
            onPress={save}
          />
        </View>
      }
    >
      <View className="gap-4">
        <AppText variant="small" tone="muted">
          {t("profileBody")}
        </AppText>
        <Field label={t("usernameLabel")} error={errors.username}>
          <Input
            value={form.username}
            onChangeText={(v) => set("username", v.trim())}
            placeholder={t("usernamePlaceholder")}
            accessibilityLabel={t("usernameLabel")}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={31}
          />
        </Field>
        <UsernameHint check={check} onPick={(s) => set("username", s)} />
        {usernameChanged && handle ? (
          <AppText variant="caption">{t("usernameMoveNote")}</AppText>
        ) : null}
        <Field label={t("bioLabel")} error={errors.bio} hint={t("bioHint")}>
          <Input
            value={form.bio}
            onChangeText={(v) => set("bio", v)}
            accessibilityLabel={t("bioLabel")}
            multiline
            numberOfLines={3}
            maxLength={160}
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />
        </Field>
        <Field label={t("websiteLabel")} error={errors.website}>
          <Input
            value={form.website}
            onChangeText={(v) => set("website", v)}
            accessibilityLabel={t("websiteLabel")}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://"
          />
        </Field>
        <View className="gap-3">
          <View className="gap-1">
            <AppText variant="bodyStrong">{t("socialTitle")}</AppText>
            <AppText variant="caption">{t("socialHint")}</AppText>
          </View>
          {LISTER_SOCIAL_NETWORKS.map((network) => (
            <Field key={network} label={LISTER_SOCIAL_NETWORK_NAME[network]}>
              <Input
                value={form[network]}
                onChangeText={(v) => set(network, v)}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t("socialPlaceholder")}
                accessibilityLabel={LISTER_SOCIAL_NETWORK_NAME[network]}
              />
            </Field>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

/**
 * An Owner picks a square photo for the team: it goes straight to
 * Cloudinary with the team's signature (the team's own folder), then is
 * saved for the team. Resolves false when the picker was dismissed.
 */
export function useTeamPhotoUpload(teamId: string) {
  const save = useSaveTeamPhoto();
  const [busy, setBusy] = useState(false);

  const pick = async (
    onProgress?: (fraction: number) => void,
  ): Promise<
    { ok: true; message?: string } | { ok: false; message: string } | null
  > => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return {
        ok: false,
        message: translatorFor("teams")("photoPermission"),
      };
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]) return null;
    setBusy(true);
    try {
      const upload = await uploadToCloudinary(picked.assets[0].uri, "avatar", {
        onProgress,
        signature: () => api.teams.photoSignature(teamId),
      });
      const res = await save.mutateAsync({
        teamId,
        publicId: upload.publicId,
        version: upload.version,
        transformation:
          upload.width && upload.height
            ? `${upload.width}, ${upload.height}`
            : null,
      });
      if (res.status === 200) return { ok: true, message: res.message };
      return {
        ok: false,
        message:
          res.message ?? translatorFor("settings")("thatPhotoDidnTUploadCheck"),
      };
    } catch (e) {
      return {
        ok: false,
        message:
          e instanceof Error && e.message
            ? e.message
            : translatorFor("settings")("thatPhotoDidnTUploadCheck"),
      };
    } finally {
      setBusy(false);
    }
  };

  return { pick, busy };
}
