import express from "express";
import { detectLocale } from "./localeController.js";

const router = express.Router();

router.get("/detect", detectLocale);

export default router;

