ALTER TABLE room_member
ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS room_member_active_mute_idx
ON room_member (muted_until)
WHERE muted_until IS NOT NULL;
