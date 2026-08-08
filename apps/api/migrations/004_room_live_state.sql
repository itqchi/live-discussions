ALTER TABLE discussion_room
ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS discussion_room_live_idx ON discussion_room(is_live);
