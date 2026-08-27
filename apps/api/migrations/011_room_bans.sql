ALTER TABLE room_member
ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS room_member_room_banned_idx
ON room_member(room_id, banned)
WHERE banned = TRUE;
