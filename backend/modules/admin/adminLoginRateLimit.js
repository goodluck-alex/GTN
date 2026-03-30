/**
 * In-memory login rate limit by client IP (per process). Complements per-account lockout.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 40;

const buckets = new Map();

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

export function adminLoginIpRateLimit(req, res, next) {
  const key = clientIp(req);
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > MAX_ATTEMPTS) {
    return res.status(429).json({
      ok: false,
      error: "Too many login attempts from this network. Try again later.",
      code: "RATE_LIMITED",
    });
  }
  next();
}
