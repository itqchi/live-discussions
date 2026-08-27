ALTER TABLE room_member
ADD COLUMN IF NOT EXISTS on_stage BOOLEAN;

UPDATE room_member
SET on_stage = role <> 'listener'
WHERE on_stage IS NULL;

ALTER TABLE room_member
ALTER COLUMN on_stage SET DEFAULT FALSE;

ALTER TABLE room_member
ALTER COLUMN on_stage SET NOT NULL;
