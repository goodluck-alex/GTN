import express from "express";
import {
  send,
  getHistory,
  getConversations,
  sendRoom,
  getRoomMessages,
  markRead,
  sendVoice,
  getMedia,
} from "./messagingController.js";

import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.post("/send", authenticate, send);
router.post("/read", authenticate, markRead);
router.post("/voice", authenticate, sendVoice);
router.get("/media/:messageId", authenticate, getMedia);
router.get("/conversations", authenticate, getConversations);
router.get("/history", authenticate, getHistory);

router.post("/room/send", authenticate, sendRoom);
router.get("/room/messages", authenticate, getRoomMessages);

export default router;
