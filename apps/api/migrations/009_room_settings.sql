ALTER TABLE discussion_room
ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

ALTER TABLE discussion_room
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS discussion_room_locked_idx
ON discussion_room(is_locked);
