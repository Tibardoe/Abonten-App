import * as Sentry from "@sentry/nextjs";

// Tags the current request as Field Ops work so an error from a field
// member is separable from the rest of the web app's traffic. @sentry/nextjs
// isolates scope per request, so this only marks the request it is called
// from.
//
// What goes on the event is the campaign, the member's ROLE and the page --
// never a name, a phone number, or anything about the business being
// onboarded. The member's own user id is already on the event from the
// session; nothing about the owner they are verifying belongs in an error
// report.

export function tagFieldOpsRequest(ctx: {
  campaignId: string;
  role: string;
  isLead: boolean;
}): void {
  Sentry.setTag("fieldops", "true");
  Sentry.setTag("fieldops.role", ctx.role);
  Sentry.setTag("fieldops.campaign", ctx.campaignId);
  Sentry.addBreadcrumb({
    category: "fieldops",
    level: "info",
    message: "field ops context resolved",
    data: { role: ctx.role, isLead: ctx.isLead },
  });
}
