import { getUserDetails } from "@/actions/getUserDetails";
import AvatarUploadButton from "@/components/atoms/AvatarUploadButton";
import MobileUploadButton from "@/components/atoms/MobileUploadButton";
import UserAvatar from "@/components/atoms/UserAvatar";
import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import EditProfileInputFields from "@/components/organisms/EditProfileInputFields";

export default async function page() {
  const userProfile = await getUserDetails();

  if (userProfile.status !== 200) {
    return <p className="text-red-500">{userProfile.message}</p>;
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
      <MobileSettingsHeaderNav title="Edit Profile" />

      <div className="space-y-10 md:space-y-16">
        <div className="flex justify-between items-center bg-black bg-opacity-5 rounded-xl p-3 md:p-5">
          <div className="flex gap-3 items-center">
            <UserAvatar avatarUrl={avatarUrl} width={80} height={80} />
            <div className="min-w-fit">
              <h1 className="font-bold">{userDetails.username}</h1>
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
