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

export type ProfileCompletionItemKey =
  | "name"
  | "username"
  | "avatar"
  | "email"
  | "phone";

export type ProfileCompletionGroup = "profile" | "account";

/** `unverified`: the value exists (or a change is waiting) but isn't confirmed. */
export type ProfileCompletionItemState = "done" | "missing" | "unverified";

export type ProfileCompletionItem = {
  key: ProfileCompletionItemKey;
  group: ProfileCompletionGroup;
  /** What to do, e.g. "Add your email". */
  label: string;
  /** What it is once done, e.g. "Email verified". */
  doneLabel: string;
  /** Why it helps — only what the product really does with it. */
  description: string;
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

export const PROFILE_COMPLETION_GROUP_TITLES: Record<
  ProfileCompletionGroup,
  string
> = {
  profile: "Your profile",
  account: "Sign-in & contact",
};

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
      label: "Add your name",
      doneLabel: "Name added",
      description: "Shown on your profile so people know who you are.",
      state: input.fullName?.trim() ? "done" : "missing",
      complete: !!input.fullName?.trim(),
      href: "/settings/edit-profile",
    },
    {
      key: "username",
      group: "profile",
      label: "Choose a username",
      doneLabel: "Username chosen",
      description:
        "Your @handle — it's shown on your reviews and in your profile link. The one you have now was made up for you.",
      state: input.usernameIsGenerated === false ? "done" : "missing",
      complete: input.usernameIsGenerated === false,
      href: "/settings/edit-profile",
    },
    {
      key: "avatar",
      group: "profile",
      label: "Add a profile photo",
      doneLabel: "Profile photo added",
      description:
        "Shown on your profile and next to your reviews and messages.",
      state: input.avatarPublicId ? "done" : "missing",
      complete: !!input.avatarPublicId,
      href: "/settings/edit-profile",
    },
    {
      key: "email",
      group: "account",
      label:
        email === "unverified" && !emailUsable
          ? input.email
            ? "Verify your email"
            : "Confirm your email"
          : "Add your email",
      doneLabel: "Email verified",
      description:
        "Needed to pay for tickets and promotions — your tickets and receipts are emailed to you. You can also sign in with a code sent there.",
      state: emailUsable ? "done" : email,
      complete: emailUsable,
      href: "/settings/security",
    },
    {
      key: "phone",
      group: "account",
      label:
        phone === "unverified"
          ? "Verify your phone number"
          : "Add your phone number",
      doneLabel: "Phone number verified",
      description:
        "Lets you sign in with a code sent by text — a way back in if you can't get into your email or Google account.",
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
