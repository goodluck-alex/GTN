import express from "express";
import { register, login, login2fa } from "./authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/login/2fa", login2fa);

export default router;
