"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";

// "Not now" on the account-setup reminder. Recorded per account
// (account_setup_prompt_dismiss) so it holds on every device; each dismissal
// keeps it away longer (7, 30, then 90 days).
export const dismissAccountSetupPrompt = withActionLocale(
  async function dismissAccountSetupPrompt(): Promise<{
    status: number;
    message?: string;
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotAuthenticated") };

    const { error } = await supabase.rpc("account_setup_prompt_dismiss");
    if (error) {
      logger.error(`account_setup_prompt_dismiss failed: ${error.message}`);
      return { status: 500, message: tr("somethingWentWrong") };
    }
    return { status: 200 };
  },
);
