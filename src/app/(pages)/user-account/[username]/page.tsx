import { getUserProfileDetails } from "@/actions/getUserProfileDetails";
// import UserAccountLogin from "@/components/organisms/UserAccountLogin";
// import { createClient } from "@/config/supabase/server";
import Higlight from "@/userAccount/molecules/Highlight";
import ContentArea from "@/userAccount/organisms/ContentArea";
import ProfileDetails from "@/userAccount/organisms/ProfileDetails";

export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const username = (await params).username;

  const userDetails = await getUserProfileDetails(username);

  const { data } = userDetails;

  return (
    <div className="flex flex-col gap-7">
      <ProfileDetails username={username} />

      {data.username === username && <Higlight />}

      <ContentArea />
    </div>
  );
}
