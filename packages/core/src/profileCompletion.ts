// What "finishing setting up your account" means on Abonten — one list, used
// by the web Edit Profile checklist, the mobile Account setup screen, the
// reminder card and the one-time "Complete your profile" notification.
//
// Always computed from the live profile and sign-in fields; a stored
// percentage would go stale. Nothing here is required to use Abonten, so the
// list is a set of recommended steps, each with the real reason it helps —
// it never claims an optional step is mandatory. The reason text states only
// what the product actually does:
//
//   Profile
//     name      user_info.full_name — shown on your profile.
//     username  user_info.username_is_generated = false — the system-made
//               "user12345678" handle doesn't count. Shown on reviews.
//     avatar    user_info.avatar_public_id — profile, reviews, messages.
//   Sign-in & contact
//     email     auth email present AND confirmed. Paying for tickets and
//               promotions requires it (createMultiCheckoutPaymentAttemptCore
//               refuses without one); tickets and receipts are emailed; it is
//               a sign-in method (email code).
//     phone     auth phone present AND confirmed. A sign-in method (text
//               code) — a way back in if email/Google access is lost.
//
// A bio and a website are optional extras and deliberately not listed.

import type { CoreTranslator } from "./i18n/translator";

export type ProfileCompletionItemKey =
  | "name"
  | "username"
  | "avatar"
  | "email"
  | "phone";

export type ProfileCompletionGroup = "profile" | "account";

/** `unverified`: the value exists (or a change is waiting) but isn't confirmed. */
export type ProfileCompletionItemState = "done" | "missing" | "unverified";

/**
 * A key of the checklist's own group in the core namespace. Typed as that
 * group, not as any string, so the web app knows which messages a screen
 * showing the checklist needs (scripts/i18n/gen-route-messages.mjs).
 */
export type ProfileCompletionCopyKey = `profileCompletion.${string}`;

export type ProfileCompletionItem = {
  key: ProfileCompletionItemKey;
  group: ProfileCompletionGroup;
  /**
   * Keys under the core namespace (render with profileCompletionItemCopy):
   * what to do ("Add your email"), what it is once done ("Email verified"),
   * and why it helps — only what the product really does with it.
   */
  labelKey: ProfileCompletionCopyKey;
  doneLabelKey: ProfileCompletionCopyKey;
  descriptionKey: ProfileCompletionCopyKey;
  state: ProfileCompletionItemState;
  complete: boolean;
  /** Web settings route that completes it; mobile maps it to its own screen. */
  href: string;
};

export type ProfileCompletion = {
  items: ProfileCompletionItem[];
  completedCount: number;
  total: number;
  isComplete: boolean;
};

export type ProfileCompletionInput = {
  fullName: string | null | undefined;
  usernameIsGenerated: boolean | null | undefined;
  avatarPublicId: string | null | undefined;
  email: string | null | undefined;
  emailConfirmedAt: string | null | undefined;
  /** Supabase `user.new_email`: an email change waiting for its code. */
  pendingEmail?: string | null | undefined;
  phone?: string | null | undefined;
  phoneConfirmedAt?: string | null | undefined;
};

export const PROFILE_COMPLETION_GROUPS: readonly ProfileCompletionGroup[] = [
  "profile",
  "account",
] as const;

export function profileCompletionGroupTitle(
  t: CoreTranslator,
  group: ProfileCompletionGroup,
): string {
  return t(`profileCompletion.group.${group}`);
}

/** The words of one step, in the reader's language. */
export function profileCompletionItemCopy(
  t: CoreTranslator,
  item: Pick<
    ProfileCompletionItem,
    "labelKey" | "doneLabelKey" | "descriptionKey"
  >,
): { label: string; doneLabel: string; description: string } {
  return {
    label: t(item.labelKey),
    doneLabel: t(item.doneLabelKey),
    description: t(item.descriptionKey),
  };
}

function emailState(input: ProfileCompletionInput): ProfileCompletionItemState {
  if (input.email && input.emailConfirmedAt && !input.pendingEmail)
    return "done";
  if (input.email || input.pendingEmail) return "unverified";
  return "missing";
}

function phoneState(input: ProfileCompletionInput): ProfileCompletionItemState {
  if (!input.phone) return "missing";
  return input.phoneConfirmedAt ? "done" : "unverified";
}

export function computeProfileCompletion(
  input: ProfileCompletionInput,
): ProfileCompletion {
  const email = emailState(input);
  // A pending change on an account that already has a verified address is
  // still "done" for the purpose of paying and signing in; the setup screen
  // shows the pending code step separately.
  const emailUsable = !!input.email && !!input.emailConfirmedAt;
  const phone = phoneState(input);

  const items: ProfileCompletionItem[] = [
    {
      key: "name",
      group: "profile",
      labelKey: "profileCompletion.name.label",
      doneLabelKey: "profileCompletion.name.done",
      descriptionKey: "profileCompletion.name.description",
      state: input.fullName?.trim() ? "done" : "missing",
      complete: !!input.fullName?.trim(),
      href: "/settings/edit-profile",
    },
    {
      key: "username",
      group: "profile",
      labelKey: "profileCompletion.username.label",
      doneLabelKey: "profileCompletion.username.done",
      descriptionKey: "profileCompletion.username.description",
      state: input.usernameIsGenerated === false ? "done" : "missing",
      complete: input.usernameIsGenerated === false,
      href: "/settings/edit-profile",
    },
    {
      key: "avatar",
      group: "profile",
      labelKey: "profileCompletion.avatar.label",
      doneLabelKey: "profileCompletion.avatar.done",
      descriptionKey: "profileCompletion.avatar.description",
      state: input.avatarPublicId ? "done" : "missing",
      complete: !!input.avatarPublicId,
      href: "/settings/edit-profile",
    },
    {
      key: "email",
      group: "account",
      labelKey:
        email === "unverified" && !emailUsable
          ? input.email
            ? "profileCompletion.email.verify"
            : "profileCompletion.email.confirm"
          : "profileCompletion.email.label",
      doneLabelKey: "profileCompletion.email.done",
      descriptionKey: "profileCompletion.email.description",
      state: emailUsable ? "done" : email,
      complete: emailUsable,
      href: "/settings/security",
    },
    {
      key: "phone",
      group: "account",
      labelKey:
        phone === "unverified"
          ? "profileCompletion.phone.verify"
          : "profileCompletion.phone.label",
      doneLabelKey: "profileCompletion.phone.done",
      descriptionKey: "profileCompletion.phone.description",
      state: phone,
      complete: phone === "done",
      href: "/settings/security",
    },
  ];

  const completedCount = items.filter((item) => item.complete).length;

  return {
    items,
    completedCount,
    total: items.length,
    isComplete: completedCount === items.length,
  };
}

/**
 * The one incomplete step worth leading with in a reminder: an email first
 * (without one you can't pay), then a second way to sign in, then the
 * profile steps in list order.
 */
export function leadingIncompleteItem(
  completion: ProfileCompletion,
): ProfileCompletionItem | null {
  const order: ProfileCompletionItemKey[] = [
    "email",
    "phone",
    "username",
    "name",
    "avatar",
  ];
  for (const key of order) {
    const item = completion.items.find((i) => i.key === key);
    if (item && !item.complete) return item;
  }
  return null;
}
