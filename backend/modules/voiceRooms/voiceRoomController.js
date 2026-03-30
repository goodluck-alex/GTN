import * as service from "./voiceRoomService.js";

export const getRooms = async (req, res) => {
  try {
    const rooms = await service.getRooms();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getRoom = async (req, res) => {
  try {
    const room = await service.getRoomById(req.params.id);
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createRoom = async (req, res) => {
  try {
    const room = await service.createRoom(
      {
        name: req.body?.name,
        privacy: req.body?.privacy,
        maxParticipants: req.body?.maxParticipants,
      },
      req.user.id
    );
    res.json(room);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const deleteRoom = async (req, res) => {
  try {
    await service.deleteRoom(req.params.id, req.user.id);
    res.json({ message: "Room deleted" });
  } catch (err) {
    if (err.code === "FORBIDDEN") return res.status(403).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
};

export const joinRoom = async (req, res) => {
  try {
    const room = await service.joinRoom(req.params.id, req.user.id, {
      mode: req.body?.mode,
    });
    res.json(room);
  } catch (err) {
    if (err.code === "ROOM_FULL") return res.status(403).json({ error: err.message });
    if (err.code === "INSUFFICIENT_FUNDS") return res.status(402).json({ error: err.message });
    res.status(400).json({ error: err.message });
  }
};

export const leaveRoom = async (req, res) => {
  try {
    await service.leaveRoom(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const endRoom = async (req, res) => {
  try {
    await service.endRoom(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "FORBIDDEN") return res.status(403).json({ error: err.message });
    res.status(400).json({ error: err.message });
  }
};

export const listMessages = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const messages = await service.listMessages(req.params.id, { limit });
    res.json(messages.reverse());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const postMessage = async (req, res) => {
  try {
    const msg = await service.postMessage(req.params.id, req.user.id, req.body?.content);
    res.json(msg);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const postReaction = async (req, res) => {
  try {
    const r = await service.postReaction(
      req.params.id,
      req.user.id,
      req.body?.emoji,
      req.body?.targetUserId
    );
    res.json(r);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const muteParticipant = async (req, res) => {
  try {
    const out = await service.setParticipantMuted(
      req.params.id,
      Number(req.body?.targetUserId),
      req.user.id,
      req.body?.muted !== false
    );
    res.json(out);
  } catch (err) {
    if (err.code === "FORBIDDEN") return res.status(403).json({ error: err.message });
    res.status(400).json({ error: err.message });
  }
};
