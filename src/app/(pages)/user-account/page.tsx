import UserAccountLogin from "@/components/organisms/UserAccountLogin";
import { createClient } from "@/config/supabase/server";
import UserAccount from "@/userAccount/templates/UserAccount";

export default async function page() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return <UserAccountLogin />;
  }

  return <UserAccount />;
}
