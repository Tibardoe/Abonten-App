"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

// "Not now" on the account-setup reminder. Recorded per account
// (account_setup_prompt_dismiss) so it holds on every device; each dismissal
// keeps it away longer (7, 30, then 90 days).
export async function dismissAccountSetupPrompt(): Promise<{
  status: number;
  message?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not authenticated" };

  const { error } = await supabase.rpc("account_setup_prompt_dismiss");
  if (error) {
    logger.error(`account_setup_prompt_dismiss failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }
  return { status: 200 };
}
