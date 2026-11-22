import { ImageViewer } from "@/components/ImageViewer";
import { UploadProgress } from "@/components/UploadProgress";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { ProfileCompletionCard } from "@/components/profile/ProfileCompletionCard";
import { FormSkeleton } from "@/components/skeletons";
import { useAvatarUpload } from "@/features/profile/useAvatarUpload";
import { useProfile } from "@/features/profile/useProfile";
import {
  ProfileUpdateRefused,
  useUpdateProfile,
} from "@/features/profile/useUpdateProfile";
import { useUploadProgress } from "@/features/uploads/useUploadProgress";
import { useQueryView } from "@/lib/useQueryView";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import {
  LISTER_SOCIAL_NETWORKS,
  LISTER_SOCIAL_NETWORK_NAME,
  type ListerSocialNetwork,
  listerSocialLinkFields,
} from "@abonten/core/social/listerSocialLinks";
import {
  AppText,
  Avatar,
  Button,
  Field,
  Input,
  KeyboardAwareScrollView,
  ScreenError,
  useToast,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { editProfileSchema } from "@abonten/validation/editProfileSchema";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";

// Native echo of the web EditProfileInputFields — the same
// @abonten/validation editProfileSchema (username / full_name / website /
// bio / social accounts), validated on submit, saved through
// PATCH /api/mobile/profile (the website's service), plus the avatar upload
// (Cloudinary signed direct upload). The social accounts are the ones
// Abonten tags when it posts the person's events (Admin › Social).

type FormState = {
  username: string;
  full_name: string;
  website: string;
  bio: string;
} & Record<ListerSocialNetwork, string>;

const FORM_KEYS: (keyof FormState)[] = [
  "username",
  "full_name",
  "website",
  "bio",
  ...LISTER_SOCIAL_NETWORKS,
];

const EMPTY_FORM: FormState = {
  username: "",
  full_name: "",
  website: "",
  bio: "",
  instagram: "",
  x: "",
  tiktok: "",
  facebook: "",
};

/** The form as the saved profile fills it. */
function profileForm(profile: {
  username: string | null;
  full_name: string | null;
  website: string | null;
  bio: string | null;
  social_links?: Record<string, string> | null;
}): FormState {
  return {
    username: profile.username ?? "",
    full_name: profile.full_name ?? "",
    website: profile.website ?? "",
    bio: profile.bio ?? "",
    ...listerSocialLinkFields(profile.social_links ?? null),
  };
}

export default function EditProfile() {
  const t = useTranslations("settings");

  const profileQuery = useProfile();
  const { data: profile, refetch: refetchProfile } = profileQuery;
  // Loading, offline and failed are told apart: the form never opens on a
  // profile the phone does not have (it is cached on disk, so a saved one
  // still opens offline).
  const profileView = useQueryView(profileQuery);
  const update = useUpdateProfile();
  const toast = useToast();
  const avatar = useAvatarUpload();
  const avatarProgress = useUploadProgress();
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [saved, setSaved] = useState(false);

  async function onChangePhoto() {
    avatarProgress.start();
    try {
      const res = await avatar.mutateAsync({
        onProgress: avatarProgress.onProgress,
        onUploadComplete: avatarProgress.finishUpload,
      });
      // `null` means the picker was dismissed — not a failure, and not
      // something to congratulate the user about either.
      if (res) toast.success(t("profilePhotoUpdated"));
    } catch {
      // The inline error under the button already explains it; the mutation
      // holds the message.
    } finally {
      avatarProgress.reset();
    }
  }

  // Fill the form from the profile, and follow later answers (a new photo
  // or a save refetches it) only in the fields the person has not touched:
  // re-filling the whole form threw away a typed username when the photo
  // changed. `website` comes from the profile route, which adds it to the
  // view's row; without it every save wrote "" over the saved website.
  const serverValues = useRef<FormState | null>(null);
  useEffect(() => {
    if (!profile) return;
    const next = profileForm(profile);
    const previous = serverValues.current;
    serverValues.current = next;
    setForm((current) => {
      if (!previous) return next;
      const kept = { ...next };
      for (const key of FORM_KEYS) {
        if (current[key] !== previous[key]) kept[key] = current[key];
      }
      return kept;
    });
  }, [profile]);

  const dirty = useMemo(() => {
    if (!profile) return false;
    const saved = profileForm(profile);
    return FORM_KEYS.some((key) => form[key] !== saved[key]);
  }, [form, profile]);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function onSave() {
    const candidate = {
      username: form.username,
      full_name: form.full_name,
      website: form.website,
      bio: form.bio,
      social_links: {
        instagram: form.instagram,
        x: form.x,
        tiktok: form.tiktok,
        facebook: form.facebook,
      },
      avatar_public_id: profile?.avatar_public_id ?? "",
      avatar_version: profile?.avatar_version ?? "",
    };
    const result = editProfileSchema.safeParse(candidate);
    if (!result.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of result.error.issues) {
        // A social account's issue is at ["social_links", network].
        const key = (
          issue.path[0] === "social_links" ? issue.path[1] : issue.path[0]
        ) as keyof FormState;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    const links = result.data.social_links;
    update.mutate(
      {
        username: result.data.username,
        full_name: result.data.full_name,
        bio: result.data.bio,
        website: result.data.website,
        social_links: {
          instagram: links?.instagram ?? "",
          x: links?.x ?? "",
          tiktok: links?.tiktok ?? "",
          facebook: links?.facebook ?? "",
        },
      },
      {
        onSuccess: (saved) => {
          setSaved(true);
          // What was stored: an @handle comes back as the profile address.
          if (saved) {
            setForm((f) => ({
              ...f,
              ...listerSocialLinkFields(saved.socialLinks),
            }));
          }
        },
      },
    );
  }

  if (!profile) {
    if (profileView.kind === "content" || profileView.kind === "empty") {
      // The server's own answer: no profile row yet.
      return (
        <ScreenError
          message={t("couldnTLoadYourProfile")}
          onRetry={() => refetchProfile()}
        />
      );
    }
    return (
      <View className="flex-1 bg-background">
        <QueryUnavailable
          view={profileView}
          subject={t("yourProfile")}
          onRetry={() => refetchProfile()}
          loading={<FormSkeleton fields={5} />}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("editProfile2")}
        backFallback="/(app)/settings"
      />
      <KeyboardAwareScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-5 p-4"
      >
        <ProfileCompletionCard />

        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => setPhotoViewerOpen(true)}
            disabled={!profile.avatar_public_id}
            accessibilityRole="button"
            accessibilityLabel={t("viewProfilePhoto")}
          >
            <Avatar
              publicId={profile.avatar_public_id ?? undefined}
              version={profile.avatar_version ?? undefined}
              size={64}
            />
          </Pressable>
          <View className="flex-1 gap-1">
            <AppText variant="bodyStrong">{profile.username}</AppText>
            <Button
              title={t("changePhoto")}
              loadingTitle={t("uploading")}
              variant="outline"
              size="sm"
              onPress={onChangePhoto}
              loading={avatar.isPending}
            />
            <UploadProgress state={avatarProgress} what="photo" />
            {avatar.isError ? (
              <AppText variant="small" tone="error">
                {avatar.error instanceof Error
                  ? avatar.error.message
                  : t("thatPhotoDidnTUploadCheck")}
              </AppText>
            ) : null}
          </View>
        </View>

        <Field label={t("username")} error={errors.username}>
          <Input
            value={form.username}
            onChangeText={(v) => set("username", v)}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>

        <Field label={t("fullName")} error={errors.full_name}>
          <Input
            value={form.full_name}
            onChangeText={(v) => set("full_name", v)}
          />
        </Field>

        <Field label={t("website")} error={errors.website} hint={t("optional")}>
          <Input
            value={form.website}
            onChangeText={(v) => set("website", v)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://example.com"
          />
        </Field>

        <Field
          label={t("bio")}
          error={errors.bio}
          hint={t("upTo160Characters")}
        >
          <Input
            value={form.bio}
            onChangeText={(v) => set("bio", v)}
            multiline
            numberOfLines={4}
            style={{ minHeight: 96, textAlignVertical: "top" }}
          />
        </Field>

        <View className="gap-3">
          <View className="gap-1">
            <AppText variant="bodyStrong">{t("socialAccounts")}</AppText>
            <AppText variant="caption">{t("socialAccountsHint")}</AppText>
          </View>
          {LISTER_SOCIAL_NETWORKS.map((network) => (
            <Field
              key={network}
              label={LISTER_SOCIAL_NETWORK_NAME[network]}
              error={errors[network]}
            >
              <Input
                value={form[network]}
                onChangeText={(v) => set(network, v)}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t("socialHandlePlaceholder")}
                accessibilityLabel={LISTER_SOCIAL_NETWORK_NAME[network]}
              />
            </Field>
          ))}
        </View>

        {update.isError ? (
          <AppText variant="small" tone="error">
            {update.error instanceof ProfileUpdateRefused &&
            update.error.message
              ? update.error.message
              : t("weCouldnTUpdateYourProfile")}
          </AppText>
        ) : null}
        {saved ? (
          <AppText variant="small" tone="brand">
            {t("profileUpdated")}
          </AppText>
        ) : null}

        <Button
          title={t("saveChanges")}
          onPress={onSave}
          loading={update.isPending}
          disabled={!dirty}
        />
      </KeyboardAwareScrollView>

      <ImageViewer
        uri={
          profile.avatar_public_id
            ? buildCloudinaryUrl(
                profile.avatar_public_id,
                String(profile.avatar_version ?? ""),
                { width: 1080, height: 1080 },
              )
            : null
        }
        open={photoViewerOpen}
        onClose={() => setPhotoViewerOpen(false)}
      />
    </View>
  );
}
