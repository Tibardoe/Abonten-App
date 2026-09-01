import { ProfileCompletionCard } from "@/components/profile/ProfileCompletionCard";
import { useAvatarUpload } from "@/features/profile/useAvatarUpload";
import { useProfile } from "@/features/profile/useProfile";
import { useUpdateProfile } from "@/features/profile/useUpdateProfile";
import {
  AppText,
  Avatar,
  Button,
  Field,
  Input,
  ScreenLoader,
} from "@abonten/ui-native";
import { editProfileSchema } from "@abonten/validation/editProfileSchema";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";

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
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const avatar = useAvatarUpload();

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

  if (isLoading || !profile) return <ScreenLoader />;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="gap-5 p-4"
        keyboardShouldPersistTaps="handled"
      >
        <ProfileCompletionCard />

        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => avatar.mutate()}
            disabled={avatar.isPending}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
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
              title={avatar.isPending ? "Uploading…" : "Change photo"}
              variant="outline"
              size="sm"
              onPress={() => avatar.mutate()}
              disabled={avatar.isPending}
            />
            {avatar.isError ? (
              <AppText className="text-[12px] text-destructive">
                {avatar.error instanceof Error
                  ? avatar.error.message
                  : "Upload failed."}
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
          <AppText className="text-[13px] text-destructive">
            We couldn't update your profile. Please try again.
          </AppText>
        ) : null}
        {saved ? (
          <AppText className="text-[13px] text-primary">
            Profile updated.
          </AppText>
        ) : null}

        <Button
          title="Save changes"
          onPress={onSave}
          loading={update.isPending}
          disabled={!dirty}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
