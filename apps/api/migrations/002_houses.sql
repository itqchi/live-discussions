CREATE TABLE IF NOT EXISTS discussion_house (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS house_member (
  house_id TEXT NOT NULL REFERENCES discussion_house(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (house_id, user_id)
);

CREATE TABLE IF NOT EXISTS house_room (
  house_id TEXT NOT NULL REFERENCES discussion_house(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL UNIQUE REFERENCES discussion_room(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (house_id, room_id)
);

CREATE INDEX IF NOT EXISTS house_member_user_idx ON house_member(user_id);
CREATE INDEX IF NOT EXISTS house_room_house_idx ON house_room(house_id);
