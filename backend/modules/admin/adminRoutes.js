import express from "express";
import { adminLogin, adminMe } from "./adminAuthController.js";
import { authenticateAdmin } from "./adminAuthMiddleware.js";
import { adminLoginIpRateLimit } from "./adminLoginRateLimit.js";
import adminReadRoutes from "./adminReadRoutes.js";
import adminWriteRoutes from "./adminWriteRoutes.js";

const router = express.Router();

router.post("/auth/login", adminLoginIpRateLimit, adminLogin);
router.get("/auth/me", authenticateAdmin, adminMe);

router.use(adminReadRoutes);
router.use(adminWriteRoutes);

export default router;
