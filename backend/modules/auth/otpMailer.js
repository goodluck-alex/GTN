import nodemailer from "nodemailer";

/**
 * Send OTP via email (SMTP) or log when SMTP is not configured.
 * @returns {{ sent: true } | { sent: false, reason: string }}
 */
export async function sendOtpEmail(to, code) {
  const from = process.env.SMTP_FROM || "noreply@gtnnetwork.com";

  if (!process.env.SMTP_HOST) {
    console.warn(`[GTN] SMTP not configured. Email OTP for ${to}: ${code}`);
    return { sent: false, reason: "smtp_not_configured" };
  }

  const tls =
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "false"
      ? { rejectUnauthorized: false }
      : undefined;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    ...(tls ? { tls } : {}),
  });

  try {
    await transporter.sendMail({
      from,
      to,
      subject: "Your GTN verification code",
      text: `Your GTN verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`,
      html: `<p>Your GTN verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>This code expires in 10 minutes.</p>`,
    });
  } catch (err) {
    console.error("[GTN] SMTP sendMail failed:", err?.message || err);
    throw new Error(
      `Could not send email (${err?.code || err?.responseCode || "SMTP"}). Check SMTP_* in .env.`
    );
  }

  return { sent: true };
}
