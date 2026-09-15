"use server";

import { setRecommendationEmailsByTokenCore } from "@abonten/services/notifications/recommendationEmailPreferenceCore";

/**
 * The recommendation email unsubscribe page's button. No sign-in -- the
 * link's signed token is the proof, checked by the service. Only turns the
 * emails off: opting back in is a consent decision made in Settings while
 * signed in. Web-only: the link only exists in emails, so there's no app twin.
 */
export async function setRecommendationEmailsByLink(input: {
  userId: string;
  token: string;
}): Promise<{
  status: number;
  message?: string;
  data?: { recommendationEmails: boolean };
}> {
  return setRecommendationEmailsByTokenCore({
    userId: input?.userId,
    token: input?.token,
    source: "email_link",
  });
}
