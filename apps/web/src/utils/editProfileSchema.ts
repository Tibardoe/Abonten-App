import { WEBSITE_URL_REGEX } from "@abonten/core/urlValidation";
import { z } from "zod";

// Usernames are used in public URLs (/user/[username]/...), so the allowed
// character set matches what's safe there: letters, numbers, underscore, period, hyphen.
const USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/;

export const editProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, { message: "Username must be at least 3 characters." })
    .max(30, { message: "Username must be 30 characters or fewer." })
    .regex(USERNAME_REGEX, {
      message:
        "Username can only contain letters, numbers, periods, underscores, and hyphens.",
    }),

  full_name: z
    .string()
    .trim()
    .min(1, { message: "Name is required." })
    .max(80, { message: "Name must be 80 characters or fewer." }),

  website: z
    .string()
    .trim()
    .refine((val) => val === "" || WEBSITE_URL_REGEX.test(val), {
      message: "Enter a valid website URL.",
    }),

  bio: z
    .string()
    .trim()
    .max(160, { message: "Bio must be 160 characters or fewer." }),

  // Not edited by this form (avatar changes go through AvatarUploadModal),
  // but carried through as part of UserDetailsFormType so the submitted
  // payload round-trips the current values unchanged.
  avatar_public_id: z.string(),
  avatar_version: z.string(),
});

export type EditProfileSchema = z.infer<typeof editProfileSchema>;
