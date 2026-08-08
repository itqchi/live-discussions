DELETE FROM discussion_room
WHERE is_live = FALSE;

ALTER TABLE discussion_room
ADD COLUMN IF NOT EXISTS slug TEXT;

UPDATE discussion_room
SET slug = id
WHERE slug IS NULL;

ALTER TABLE discussion_room
ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS discussion_room_slug_unique_idx
ON discussion_room(slug);
