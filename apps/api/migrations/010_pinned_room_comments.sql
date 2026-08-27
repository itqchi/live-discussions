ALTER TABLE room_comment
ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS room_comment_room_pinned_idx
ON room_comment(room_id, pinned, created_at DESC)
WHERE pinned = TRUE;
