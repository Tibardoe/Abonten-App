"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { userFacingError } from "@abonten/core/userFacingError";
import { tr } from "@abonten/services/i18n/requestLocale";
import type { Database } from "@abonten/types/database.types";

type UserInfoRow = Database["public"]["Tables"]["user_info"]["Row"];

export type GetUserDetailsResult =
  | { status: 500 | 401; message: string; userDetails?: undefined }
  | { status: 200; userDetails: UserInfoRow; message?: undefined };

export const getUserDetails = withActionLocale(
  async function getUserDetails(): Promise<GetUserDetailsResult> {
    const supabase = await createClient();

    const { data: user, error: userError } = await supabase.auth.getUser();

    if (userError) {
      return {
        status: 500,
        message: userFacingError("Error fetching user", userError),
      };
    }

    if (!user.user) {
      return { status: 401, message: tr("userNotAuthenticated") };
    }

    const { data: userDetails, error: userDetailsError } = await supabase
      .from("user_info")
      .select("*")
      .eq("id", user.user.id)
      .single();

    if (userDetailsError) {
      return {
        status: 500,
        message: userFacingError(
          "Error fetching user details",
          userDetailsError,
        ),
      };
    }

    if (!userDetails) {
      return { status: 401, message: tr("userNotFound") };
    }

    return { status: 200, userDetails };
  },
);
