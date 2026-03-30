# GTN Voice Rooms — developer reference

## Overview

Voice rooms combine **WebRTC mesh audio** (same P2P pattern as `VoiceRoomSession`), **Socket.IO** signaling, **per-minute free-minute billing only while unmuted (speaking)**, **free text chat**, and **emoji reactions**.

## Data model (Prisma)

| Model | Purpose |
|-------|---------|
| `VoiceRoom` | `name`, `createdBy` (host), `privacy` (`public`/`private`), `maxParticipants`, `status` (`active`/`ended`), `endedAt` |
| `VoiceRoomParticipant` | `roomId` + `userId` unique, `role` (`host` \| `moderator` \| `participant` \| `listener`), `joinedAt`, `leftAt`, `minutesUsed`, `paidAmount`, `muted` |
| `VoiceRoomMessage` | Room text chat (`type` default `text`) |
| `VoiceRoomReaction` | `emoji` ∈ 👏 ❤️ 🔥 🎉 👍, optional `targetUserId` |

Legacy `_RoomUsers` implicit table was **dropped**; membership is `VoiceRoomParticipant` only.

## Billing (speaking only)

- Uses plan-based billing (`freeMinutes`, and unlimited plans).
- **Register** when the client emits `voice_room:speaking_start` (after unmute).
- **Ticks** `voice_room:speaking_tick` `{ roomId, minuteIndex }` — same sequence rules as P2P calls.
- **Stop** on `voice_room:speaking_stop`, disconnect, or `leaveVoiceRoom`.
- Cannot start speaking billing while a **P2P call** billing session is active (`CONCURRENT_CALL`).
- **Listeners** (`role === "listener"`) are not charged (tick fails server-side if misconfigured).

## REST API (`/api/voice-rooms`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | Active rooms |
| POST | `/` | Body: `{ name, privacy?, maxParticipants? }` — creates room + host participant |
| GET | `/:id/messages` | History (order corrected in controller) |
| POST | `/:id/messages` | `{ content }` — optional; socket also persists |
| POST | `/:id/reactions` | `{ emoji, targetUserId? }` |
| POST | `/:id/join` | `{ mode: "speak" \| "listen" }` — `speak` runs `assertCanAffordFirstMinute` for non-host |
| POST | `/:id/leave` | Sets `leftAt`, unregisters speaking billing |
| POST | `/:id/end` | Host ends room |
| POST | `/:id/mute` | Host/mod: `{ targetUserId, muted }` |
| DELETE | `/:id` | Host deletes room |
| GET | `/:id` | Room + active participants |

## Socket.IO (authenticated)

| Event | Direction | Purpose |
|-------|------------|---------|
| `voice_room:join` / `leave` / `signal` | Existing | Mesh WebRTC |
| `voice_room:speaking_start` | C→S | `registerSpeakingSession` → `speaking_ok` / `speaking_denied` |
| `voice_room:speaking_stop` | C→S | Unregister |
| `voice_room:speaking_tick` | C→S | Bill minute |
| `voice_room:chat` | C→S | Persist + `voice_room:chat_message` to room |
| `voice_room:reaction` | C→S | Persist + `voice_room:reaction_event` |
| `voice_room:typing` | C→S | `voice_room:typing_event` to room |
| `voice_room:billing_failed` | S→C | Stop speaking / mute UI |
| `voice_room:wallet_tick` | S→Room | Legacy event name; currently carries `freeMinutes` |

## Frontend

- `VoiceRoomSession`: REST join -> socket join -> mesh; **billing starts after `speaking_ok`**; mute stops ticks; chat + quick reactions.
- Pass **`user`** for plan/free minutes in the header.

## Env

Same as calls: `WEBRTC_P2P_ONLY`, `DAILY_FREE_MINUTES`, etc.

## Apply migrations

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

(On Windows, stop `npm run dev` first if `EPERM` on Prisma engine.)
