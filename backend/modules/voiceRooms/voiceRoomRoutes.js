import express from "express";
import {
  getRooms,
  getRoom,
  createRoom,
  deleteRoom,
  joinRoom,
  leaveRoom,
  endRoom,
  listMessages,
  postMessage,
  postReaction,
  muteParticipant,
} from "./voiceRoomController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, getRooms);
router.post("/", authenticate, createRoom);

router.get("/:id/messages", authenticate, listMessages);
router.post("/:id/messages", authenticate, postMessage);
router.post("/:id/reactions", authenticate, postReaction);
router.post("/:id/mute", authenticate, muteParticipant);
router.post("/:id/join", authenticate, joinRoom);
router.post("/:id/leave", authenticate, leaveRoom);
router.post("/:id/end", authenticate, endRoom);
router.delete("/:id", authenticate, deleteRoom);
router.get("/:id", authenticate, getRoom);

export default router;
