/**
 * Best-effort client IP for session attribution (may be proxy-dependent).
 *
 * @param {import("express").Request | undefined} req
 */
export function getClientIp(req) {
  if (!req) return "";
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  const ip = req.socket?.remoteAddress || "";
  if (ip.startsWith("::ffff:")) return ip.replace("::ffff:", "");
  return ip;
}
