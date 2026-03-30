/**
 * Phase 4 RBAC: support (ops) vs superadmin (catalog + payment rails).
 * Legacy role "admin" maps to superadmin so existing operators keep access.
 */
export function effectiveAdminRole(raw) {
  const r = String(raw || "")
    .toLowerCase()
    .trim();
  if (r === "admin" || r === "superadmin") return "superadmin";
  if (r === "support") return "support";
  return "support";
}

export function isSuperadminRole(raw) {
  return effectiveAdminRole(raw) === "superadmin";
}

export function requireSuperadmin(req, res, next) {
  if (!isSuperadminRole(req.admin?.role)) {
    return res.status(403).json({
      ok: false,
      error: "This action requires a superadmin account.",
      code: "FORBIDDEN",
    });
  }
  next();
}
