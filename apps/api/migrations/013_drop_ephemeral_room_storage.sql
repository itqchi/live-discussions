-- Rooms are live-session state owned by the API/LiveKit lifecycle, not durable database entities.
-- Keep persistent House/user data, but remove every table whose lifetime is scoped to a room.

DROP TABLE IF EXISTS room_comment_reaction;
DROP TABLE IF EXISTS room_comment;
DROP TABLE IF EXISTS house_room;
DROP TABLE IF EXISTS room_member;
DROP TABLE IF EXISTS discussion_room;
