ALTER TABLE house_room
ADD COLUMN IF NOT EXISTS room_title_key TEXT;

UPDATE house_room link
SET room_title_key = LOWER(BTRIM(room.title))
FROM discussion_room room
WHERE room.id = link.room_id
  AND link.room_title_key IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM house_room
    GROUP BY house_id, room_title_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce House room-name uniqueness because duplicate room names already exist in a House.';
  END IF;
END
$$;

ALTER TABLE house_room
ALTER COLUMN room_title_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS house_room_house_title_key_unique_idx
ON house_room(house_id, room_title_key);

CREATE OR REPLACE FUNCTION set_house_room_title_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT LOWER(BTRIM(title))
  INTO NEW.room_title_key
  FROM discussion_room
  WHERE id = NEW.room_id;

  IF NEW.room_title_key IS NULL THEN
    RAISE EXCEPTION 'Room % does not exist.', NEW.room_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS house_room_set_title_key ON house_room;

CREATE TRIGGER house_room_set_title_key
BEFORE INSERT OR UPDATE OF room_id
ON house_room
FOR EACH ROW
EXECUTE FUNCTION set_house_room_title_key();
