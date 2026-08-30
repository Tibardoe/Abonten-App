export type ProfileCompletionItemKey = "name" | "username" | "email" | "avatar";

export type ProfileCompletionItem = {
  key: ProfileCompletionItemKey;
  label: string;
  complete: boolean;
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
};

// The 4 completion criteria, decided explicitly (not left implicit):
//   1. Name       -- full_name is set.
//   2. Username    -- the user has actually customized it (a system-assigned
//                     "user12345678" default does NOT count).
//   3. Email        -- present AND verified (a typed-but-unconfirmed email
//                     doesn't count either).
//   4. Avatar       -- a profile picture has been uploaded.
// Phone is deliberately excluded: a phone sign-up already went through
// verified OTP, so there's nothing left to "complete" for it here.
export function computeProfileCompletion(
  input: ProfileCompletionInput,
): ProfileCompletion {
  const items: ProfileCompletionItem[] = [
    {
      key: "name",
      label: "Add your name",
      complete: !!input.fullName?.trim(),
      href: "/settings/edit-profile",
    },
    {
      key: "username",
      label: "Choose a username",
      complete: input.usernameIsGenerated === false,
      href: "/settings/edit-profile",
    },
    {
      key: "email",
      label: "Verify your email",
      complete: !!input.email && !!input.emailConfirmedAt,
      href: "/settings/security",
    },
    {
      key: "avatar",
      label: "Add a profile picture",
      complete: !!input.avatarPublicId,
      href: "/settings/edit-profile",
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
