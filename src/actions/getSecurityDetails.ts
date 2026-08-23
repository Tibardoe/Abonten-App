"use server";

import { createClient } from "@/config/supabase/server";

export type SecurityDetails = {
  phone: string | null;
  phoneVerified: boolean;
  email: string | null;
  emailVerified: boolean;
};

export type GetSecurityDetailsResult =
  | { status: 200; details: SecurityDetails }
  | { status: 401; message: string };

// Settings -> Security reads phone/email straight off auth.users (via
// getUser()) rather than a duplicated column on user_info -- Supabase Auth
// is already the authoritative store for both.
export default async function getSecurityDetails(): Promise<GetSecurityDetailsResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { status: 401, message: "User not authenticated" };
  }

  return {
    status: 200,
    details: {
      phone: userData.user.phone || null,
      phoneVerified: !!userData.user.phone_confirmed_at,
      email: userData.user.email || null,
      emailVerified: !!userData.user.email_confirmed_at,
    },
  };
}
