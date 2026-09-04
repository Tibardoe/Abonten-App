"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";

type UserProfileDetailsRow =
  Database["public"]["Views"]["user_profile_details"]["Row"];

export type GetUserProfileDetailsResult =
  | {
      status: 404 | 500;
      message: string;
      error?: string;
      data?: undefined;
      ownUsername?: undefined;
    }
  | {
      status: 200;
      data: UserProfileDetailsRow;
      ownUsername: string | null | undefined;
      message?: undefined;
    };

export async function getUserProfileDetails(
  username: string,
): Promise<GetUserProfileDetailsResult> {
  try {
    const supabase = await createClient();

    const [{ data, error }, { data: authData }] = await Promise.all([
      supabase
        .from("user_profile_details")
        .select("*")
        .eq("username", username)
        .single(),
      supabase.auth.getUser(),
    ]);

    let ownUsername = null;

    if (authData?.user) {
      const { data: ownInfo } = await supabase
        .from("user_info")
        .select("username")
        .eq("id", authData.user.id)
        .single();
      ownUsername = ownInfo?.username;
    }

    if (error || !data) {
      return {
        status: 404,
        message: "User profile not found",
        error: error?.message,
      };
    }

    return { status: 200, data, ownUsername };
  } catch (error) {
    logger.error("Error fetching user profile", error);
    return { status: 500, message: "Internal server error" };
  }
}
