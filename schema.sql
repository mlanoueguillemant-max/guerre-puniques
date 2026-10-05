CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('waiting','active','finished')),
  turn INTEGER NOT NULL DEFAULT 1 CHECK (turn > 0),
  current_player TEXT REFERENCES users(id) ON DELETE SET NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS games_status_created_idx ON games(status, created_at DESC);
CREATE TABLE IF NOT EXISTS game_players (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  faction TEXT NOT NULL CHECK (faction IN ('ROM','CAR','ATH','MAC')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(game_id,user_id),
  UNIQUE(game_id,faction)
);
CREATE INDEX IF NOT EXISTS game_players_user_idx ON game_players(user_id);
CREATE INDEX IF NOT EXISTS game_players_game_idx ON game_players(game_id);
