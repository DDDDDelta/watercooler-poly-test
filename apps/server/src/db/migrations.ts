/**
 * Schema migrations, applied in order and tracked with `PRAGMA user_version`.
 * Never edit a migration that has shipped — append a new one instead.
 *
 * Money columns (balance, amount, volume, cost) are INTEGER cents.
 * Share quantities are REAL. Timestamps are unix milliseconds.
 */
export const migrations: string[] = [
  /* 1: initial schema */ `
  CREATE TABLE users (
    id              INTEGER PRIMARY KEY,
    username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    display_name    TEXT    NOT NULL,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    balance         INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    last_bonus_date TEXT,
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE markets (
    id                  INTEGER PRIMARY KEY,
    question            TEXT    NOT NULL,
    description         TEXT    NOT NULL DEFAULT '',
    category            TEXT    NOT NULL,
    creator_id          INTEGER NOT NULL REFERENCES users(id),
    liquidity           REAL    NOT NULL,
    status              TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'cancelled')),
    close_at            INTEGER NOT NULL,
    resolved_outcome_id INTEGER,
    resolved_at         INTEGER,
    resolved_by         INTEGER REFERENCES users(id),
    resolution_note     TEXT,
    volume              INTEGER NOT NULL DEFAULT 0,
    created_at          INTEGER NOT NULL
  );
  CREATE INDEX markets_status ON markets(status, close_at);

  CREATE TABLE outcomes (
    id        INTEGER PRIMARY KEY,
    market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    idx       INTEGER NOT NULL,
    label     TEXT    NOT NULL,
    shares    REAL    NOT NULL DEFAULT 0,
    UNIQUE (market_id, idx)
  );

  CREATE TABLE positions (
    user_id    INTEGER NOT NULL REFERENCES users(id),
    outcome_id INTEGER NOT NULL REFERENCES outcomes(id),
    market_id  INTEGER NOT NULL REFERENCES markets(id),
    shares     REAL    NOT NULL DEFAULT 0,
    cost       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, outcome_id)
  );
  CREATE INDEX positions_market ON positions(market_id);

  CREATE TABLE trades (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    market_id    INTEGER NOT NULL REFERENCES markets(id),
    outcome_id   INTEGER NOT NULL REFERENCES outcomes(id),
    side         TEXT    NOT NULL CHECK (side IN ('buy', 'sell')),
    shares       REAL    NOT NULL,
    amount       INTEGER NOT NULL,
    price_before REAL    NOT NULL,
    price_after  REAL    NOT NULL,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX trades_market ON trades(market_id, id);
  CREATE INDEX trades_user ON trades(user_id, id);
  CREATE INDEX trades_time ON trades(created_at);

  CREATE TABLE price_history (
    id         INTEGER PRIMARY KEY,
    market_id  INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    probs      TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX price_history_market ON price_history(market_id, created_at);

  CREATE TABLE comments (
    id         INTEGER PRIMARY KEY,
    market_id  INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    body       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX comments_market ON comments(market_id, id);

  CREATE TABLE ledger (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    kind          TEXT    NOT NULL CHECK (kind IN ('signup', 'bonus', 'grant', 'buy', 'sell', 'payout', 'refund')),
    amount        INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    market_id     INTEGER REFERENCES markets(id),
    note          TEXT,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX ledger_user ON ledger(user_id, id);
  `,
];
