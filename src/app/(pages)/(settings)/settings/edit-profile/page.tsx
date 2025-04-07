import { getUserDetails } from "@/actions/getUserDetails";
import AvatarUploadButton from "@/components/atoms/AvatarUploadButton";
import UserAvatar from "@/components/atoms/UserAvatar";
import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import EditProfileInputFields from "@/components/organisms/EditProfileInputFields";
import { Button } from "@/components/ui/button";

export default async function page() {
  const userProfile = await getUserDetails();

  if (userProfile.status !== 200) {
    return <p className="text-red-500">{userProfile.message}</p>;
  }

  const { userDetails } = userProfile;

  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  const defaultAvatar = "AnonymousProfile_rn6qez";

  const avatarUrl = userDetails.avatar_public_id
    ? `${cloudinaryBaseUrl}v${userDetails.avatar_version}/${userDetails.avatar_public_id}.jpg`
    : defaultAvatar;

  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title="Edit Profile" />

      <div className="space-y-16 mb-5">
        <div className="flex justify-between items-center bg-black bg-opacity-5 rounded-xl p-5">
          <div className="flex gap-5 items-center">
            <UserAvatar avatarUrl={avatarUrl} width={40} height={40} />

            <div>
              <h1 className="font-bold">{userDetails.username}</h1>
              <p>{userDetails.full_name}</p>
            </div>
          </div>

          {/* <Button className="font-bold">Change Photo</Button> */}
          <AvatarUploadButton />
        </div>

        <EditProfileInputFields initialData={userDetails} />
      </div>
    </div>
  );
}
