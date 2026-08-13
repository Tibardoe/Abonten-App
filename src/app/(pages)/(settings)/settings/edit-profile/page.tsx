import { getUserDetails } from "@/actions/getUserDetails";
import AvatarUploadButton from "@/components/atoms/AvatarUploadButton";
import MobileUploadButton from "@/components/atoms/MobileUploadButton";
import UserAvatar from "@/components/atoms/UserAvatar";
import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import EditProfileInputFields from "@/components/organisms/EditProfileInputFields";
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

  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  const defaultPublicId = "AnonymousProfile_rn6qez";

  const defaulfVersion = "1743533914";

  const avatarUrl = userDetails.avatar_public_id
    ? `${cloudinaryBaseUrl}v${userDetails.avatar_version}/${userDetails.avatar_public_id}.jpg`
    : `${cloudinaryBaseUrl}v${defaulfVersion}/${defaultPublicId}.jpg`;

  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title={t("nav.editProfile")} />

      <div className="space-y-10 md:space-y-16">
        <div className="flex justify-between items-center bg-muted rounded-xl p-3 md:p-5">
          <div className="flex gap-3 items-center">
            <UserAvatar avatarUrl={avatarUrl} width={80} height={80} />
            <div className="min-w-fit">
              <h1 className="font-semibold">{userDetails.username}</h1>
              <p className="text-sm md:text-lg">{userDetails.full_name}</p>
            </div>
          </div>

          {/* <Button className="font-bold">Change Photo</Button> */}
          <AvatarUploadButton />
          <MobileUploadButton />
        </div>

        <EditProfileInputFields initialData={userDetails} />
      </div>
    </div>
  );
}
