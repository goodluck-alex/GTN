/**
 * Send OTP via SMS when Twilio is configured; otherwise log only (configure Twilio for production).
 * @returns {Promise<{ sent: true } | { sent: false, reason: string }>}
 */
export async function sendOtpSms(e164Phone, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    console.warn(`[GTN] Twilio not configured. SMS OTP for ${e164Phone}: ${code}`);
    return { sent: false, reason: "sms_not_configured" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = new URLSearchParams({
    To: e164Phone,
    From: from,
    Body: `Your GTN verification code is ${code}. Expires in 10 minutes.`,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`SMS send failed: ${t}`);
  }

  return { sent: true };
}
