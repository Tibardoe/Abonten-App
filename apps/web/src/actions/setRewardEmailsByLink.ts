"use server";

import { setRewardEmailsByTokenCore } from "@abonten/services/notifications/rewardEmailPreferenceCore";

/**
 * The unsubscribe page's button: turns Abonten Rewards emails off (or back
 * on) for the person a reward email was sent to. No sign-in -- the link's
 * signed token is the proof, checked by the service. Web-only: the link
 * only exists in emails, so there's no app twin.
 */
export async function setRewardEmailsByLink(input: {
  userId: string;
  token: string;
  enabled: boolean;
}): Promise<{
  status: number;
  message?: string;
  data?: { rewardEmails: boolean };
}> {
  return setRewardEmailsByTokenCore({
    userId: input?.userId,
    token: input?.token,
    enabled: input?.enabled === true,
  });
}
