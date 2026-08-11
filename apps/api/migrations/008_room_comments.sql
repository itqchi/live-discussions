CREATE TABLE IF NOT EXISTS room_comment (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES discussion_room(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  participant_name TEXT NOT NULL,
  text TEXT NOT NULL CHECK (CHAR_LENGTH(text) BETWEEN 1 AND 1000),
  reply_to_id TEXT REFERENCES room_comment(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS room_comment_room_created_idx
ON room_comment(room_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS room_comment_reaction (
  comment_id TEXT NOT NULL REFERENCES room_comment(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '👏', '🔥')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS room_comment_reaction_comment_idx
ON room_comment_reaction(comment_id, created_at ASC);
