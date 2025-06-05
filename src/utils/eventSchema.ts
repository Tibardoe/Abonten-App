import { z } from "zod";

export const eventSchema = z.object({
  title: z
    .string()
    .min(1, { message: "Title is required" })
    .max(150, { message: "Title must be less than 150 characters" }),

  description: z.string().min(1, { message: "Description is required" }),

  website_url: z
    .string()
    .refine(
      (val) =>
        val === "" ||
        /^((https?:\/\/)?(www\.)?[a-zA-Z0-9\-]+\.[a-z]{2,})(\/\S*)?$/.test(val),
      {
        message:
          "Enter a valid URL (e.g., www.example.com or https://example.com)",
      },
    )
    .optional(),

  price: z
    .number({ invalid_type_error: "Price must be a number" })
    .min(0, { message: "Price cannot be negative" })
    .optional(),

  capacity: z
    .number({ invalid_type_error: "Capacity must be a number" })
    .int({ message: "Capacity must be a whole number" })
    .positive({ message: "Capacity must be greater than 0" })
    .optional(),
});
