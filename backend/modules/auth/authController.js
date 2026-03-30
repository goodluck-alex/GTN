import * as authService from "./authService.js";

export async function register(req, res) {
  try {
    const result = await authService.completeRegistration(req.body, req);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function login(req, res) {
  try {
    const result = await authService.login(req.body, req);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/** POST /auth/login/2fa — body: { twoFactorToken, code } */
export async function login2fa(req, res) {
  try {
    const result = await authService.completeTwoFactorLogin(req.body ?? {}, req);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
