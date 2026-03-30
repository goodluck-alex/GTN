import { z } from "zod";

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(128, "New password is too long")
      .regex(/[A-Za-z]/, "New password must include a letter")
      .regex(/[0-9]/, "New password must include a number"),
    /** Required when 2FA is enabled (TOTP or backup code). */
    twoFactorCode: z.string().optional(),
  })
  .strict();

export const deleteAccountBodySchema = z
  .object({
    password: z.string().min(1, "Password is required to delete your account"),
    /** Required when 2FA is enabled (TOTP or backup code). */
    twoFactorCode: z.string().optional(),
  })
  .strict();
