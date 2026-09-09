import { ImageViewer } from "@/components/ImageViewer";
import { UploadProgress } from "@/components/UploadProgress";
import { AppHeader } from "@/components/app/AppHeader";
import { ProfileCompletionCard } from "@/components/profile/ProfileCompletionCard";
import { FormSkeleton } from "@/components/skeletons";
import { useAvatarUpload } from "@/features/profile/useAvatarUpload";
import { useProfile } from "@/features/profile/useProfile";
import { useUpdateProfile } from "@/features/profile/useUpdateProfile";
import { useUploadProgress } from "@/features/uploads/useUploadProgress";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
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
import { editProfileSchema } from "@abonten/validation/editProfileSchema";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

// Native echo of the web EditProfileInputFields — the same
// @abonten/validation editProfileSchema (username / full_name / website /
// bio), validated on submit, written straight to `user_info` (RLS
// self-update), plus the avatar upload (Cloudinary signed direct upload).
// The profile-completion checklist is still a later pass.

type FormState = {
  username: string;
  full_name: string;
  website: string;
  bio: string;
};

export default function EditProfile() {
  const {
    data: profile,
    isLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useProfile();
  const update = useUpdateProfile();
  const toast = useToast();
  const avatar = useAvatarUpload();
  const avatarProgress = useUploadProgress();
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

  const [form, setForm] = useState<FormState>({
    username: "",
    full_name: "",
    website: "",
    bio: "",
  });
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
      if (res) toast.success("Profile photo updated");
    } catch {
      // The inline error under the button already explains it; the mutation
      // holds the message.
    } finally {
      avatarProgress.reset();
    }
  }

  // Seed the form once the profile loads.
  useEffect(() => {
    if (profile) {
      setForm({
        username: profile.username ?? "",
        full_name: profile.full_name ?? "",
        website: "",
        bio: profile.bio ?? "",
      });
    }
  }, [profile]);

  const dirty = useMemo(() => {
    if (!profile) return false;
    return (
      form.username !== (profile.username ?? "") ||
      form.full_name !== (profile.full_name ?? "") ||
      form.bio !== (profile.bio ?? "") ||
      form.website !== ""
    );
  }, [form, profile]);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function onSave() {
    const candidate = {
      ...form,
      avatar_public_id: profile?.avatar_public_id ?? "",
      avatar_version: profile?.avatar_version ?? "",
    };
    const result = editProfileSchema.safeParse(candidate);
    if (!result.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    update.mutate(
      {
        username: result.data.username,
        full_name: result.data.full_name,
        bio: result.data.bio,
        website: result.data.website,
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  if (isLoading) return <FormSkeleton fields={5} />;
  if (profileError || !profile) {
    return (
      <ScreenError
        message="Couldn't load your profile."
        onRetry={() => refetchProfile()}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title="Edit Profile"
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
            accessibilityLabel="View profile photo"
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
              title="Change photo"
              loadingTitle="Uploading…"
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
                  : "That photo didn't upload. Check your connection and try again."}
              </AppText>
            ) : null}
          </View>
        </View>

        <Field label="Username" error={errors.username}>
          <Input
            value={form.username}
            onChangeText={(v) => set("username", v)}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>

        <Field label="Full name" error={errors.full_name}>
          <Input
            value={form.full_name}
            onChangeText={(v) => set("full_name", v)}
          />
        </Field>

        <Field label="Website" error={errors.website} hint="Optional">
          <Input
            value={form.website}
            onChangeText={(v) => set("website", v)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://example.com"
          />
        </Field>

        <Field label="Bio" error={errors.bio} hint="Up to 160 characters">
          <Input
            value={form.bio}
            onChangeText={(v) => set("bio", v)}
            multiline
            numberOfLines={4}
            style={{ minHeight: 96, textAlignVertical: "top" }}
          />
        </Field>

        {update.isError ? (
          <AppText variant="small" tone="error">
            We couldn't update your profile. Please try again.
          </AppText>
        ) : null}
        {saved ? (
          <AppText variant="small" tone="brand">
            Profile updated.
          </AppText>
        ) : null}

        <Button
          title="Save changes"
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
