-- Replace implicit M:N with structured participants + chat/reactions
DROP TABLE IF EXISTS "_RoomUsers";

ALTER TABLE "VoiceRoom" ADD COLUMN "privacy" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "VoiceRoom" ADD COLUMN "maxParticipants" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "VoiceRoom" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "VoiceRoom" ADD COLUMN "endedAt" TIMESTAMP(3);

ALTER TABLE "VoiceRoom" ADD CONSTRAINT "VoiceRoom_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VoiceRoomParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "minutesUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "muted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VoiceRoomParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoiceRoomParticipant_roomId_userId_key" ON "VoiceRoomParticipant"("roomId", "userId");
CREATE INDEX "VoiceRoomParticipant_roomId_idx" ON "VoiceRoomParticipant"("roomId");

ALTER TABLE "VoiceRoomParticipant" ADD CONSTRAINT "VoiceRoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VoiceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceRoomParticipant" ADD CONSTRAINT "VoiceRoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VoiceRoomMessage" (
    "id" SERIAL NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceRoomMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoiceRoomMessage_roomId_createdAt_idx" ON "VoiceRoomMessage"("roomId", "createdAt");
ALTER TABLE "VoiceRoomMessage" ADD CONSTRAINT "VoiceRoomMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VoiceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VoiceRoomReaction" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "targetUserId" INTEGER,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceRoomReaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoiceRoomReaction_roomId_createdAt_idx" ON "VoiceRoomReaction"("roomId", "createdAt");
ALTER TABLE "VoiceRoomReaction" ADD CONSTRAINT "VoiceRoomReaction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VoiceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
