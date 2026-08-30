import { getUserDetails } from "@/actions/getUserDetails";
import AvatarUploadButton from "@/components/atoms/AvatarUploadButton";
import PageHeader from "@/components/molecules/PageHeader";
import ProfileCompletionChecklist from "@/components/molecules/ProfileCompletionChecklist";
import ProfileCompletionIndicator from "@/components/molecules/ProfileCompletionIndicator";
import ViewableAvatar from "@/components/molecules/ViewableAvatar";
import EditProfileInputFields from "@/components/organisms/EditProfileInputFields";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getTranslations } from "next-intl/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const [userProfile, t] = await Promise.all([
    getUserDetails(),
    getTranslations("settings"),
  ]);

  if (userProfile.status !== 200) {
    return <p className="text-destructive">{userProfile.message}</p>;
  }

  const { userDetails } = userProfile;

  const defaultPublicId = "AnonymousProfile_rn6qez";

  const defaulfVersion = "1743533914";

  const avatarUrl = userDetails.avatar_public_id
    ? buildCloudinaryUrl(
        userDetails.avatar_public_id,
        userDetails.avatar_version,
        {
          width: 80,
          height: 80,
        },
      )
    : buildCloudinaryUrl(defaultPublicId, defaulfVersion, {
        width: 80,
        height: 80,
      });

  // Larger, aspect-ratio-preserving transform for the full-image viewer —
  // see ProfileDetails.tsx for why `height` is omitted here.
  const fullAvatarUrl = userDetails.avatar_public_id
    ? buildCloudinaryUrl(
        userDetails.avatar_public_id,
        userDetails.avatar_version,
        { width: 1080 },
      )
    : buildCloudinaryUrl(defaultPublicId, defaulfVersion, { width: 1080 });

  return (
    <div className="w-full flex flex-col gap-10">
      <PageHeader title={t("nav.editProfile")} showBackButton />

      <div className="space-y-10 md:space-y-16">
        <div className="flex justify-between items-center bg-muted rounded-xl p-3 md:p-5">
          <div className="flex gap-3 items-center">
            <ViewableAvatar
              avatarUrl={avatarUrl}
              fullImageUrl={fullAvatarUrl}
              width={80}
              height={80}
              alt="View your profile picture"
              viewable={!!userDetails.avatar_public_id}
            />
            <div className="min-w-fit">
              <h1 className="font-semibold">{userDetails.username}</h1>
              <p className="text-sm md:text-lg">{userDetails.full_name}</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <AvatarUploadButton />
            <ProfileCompletionIndicator />
          </div>
        </div>

        <ProfileCompletionChecklist />

        <EditProfileInputFields initialData={userDetails} />
      </div>
    </div>
  );
}
