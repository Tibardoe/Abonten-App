import { z } from "zod";

export const receivingAccountSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be under 100 characters")
    .regex(
      /^[a-zA-Z\s'-]+$/,
      "Name can only contain letters, spaces, apostrophes, or hyphens",
    ),
  email: z.string().email("Invalid email address"),
  phone: z
    .string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number must be no more than 15 digits")
    .regex(
      /^\+?[0-9]{10,15}$/,
      "Phone number must be digits and can start with '+'",
    ),
  bankAccountNumber: z
    .string()
    .min(8, "Account number must be at least 8 digits")
    .max(20, "Account number must be no more than 20 digits")
    .regex(/^[0-9]+$/, "Bank account number must contain only digits"),
  bankName: z
    .string()
    .trim()
    .min(2, { message: "Bank name must be at least 2 characters" })
    .max(100, { message: "Bank name must be under 100 characters" }),
  branch: z
    .string()
    .trim()
    .max(100, { message: "Branch name must be under 100 characters" })
    .optional(),
});
