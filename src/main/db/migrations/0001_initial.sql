-- Dates are local "YYYY-MM-DD" and times local "HH:mm": a task due on the 3rd stays due on the
-- 3rd wherever the clock is. Timestamps (*_at) are UTC ISO-8601.

CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

-- The template a recurring task is generated from. Every occurrence is a real row in `tasks`,
-- so streaks, reschedules and history work the same way as for one-off tasks.
CREATE TABLE task_series (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  notes                TEXT NOT NULL DEFAULT '',
  time                 TEXT,
  priority             TEXT NOT NULL DEFAULT 'medium'
                       CHECK (priority IN ('low', 'medium', 'high')),
  category_id          TEXT REFERENCES categories(id) ON DELETE SET NULL,
  recurrence           TEXT NOT NULL CHECK (recurrence IN ('daily', 'weekly', 'custom')),
  -- Bitmask of weekdays: Sunday = 1, Monday = 2 … Saturday = 64.
  weekdays             INTEGER NOT NULL CHECK (weekdays BETWEEN 1 AND 127),
  start_date           TEXT NOT NULL,
  end_date             TEXT,
  -- Occurrences exist up to this date; later ones are generated on demand.
  materialized_through TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
) STRICT;

CREATE TABLE tasks (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL CHECK (length(trim(title)) > 0),
  notes            TEXT NOT NULL DEFAULT '',
  date             TEXT,
  time             TEXT,
  priority         TEXT NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('low', 'medium', 'high')),
  category_id      TEXT REFERENCES categories(id) ON DELETE SET NULL,
  -- `rescheduled` means open but moved; `pending` and `rescheduled` are both "still to do".
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'done', 'missed', 'rescheduled')),
  series_id        TEXT REFERENCES task_series(id),
  occurrence_date  TEXT,
  original_date    TEXT,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  completed_at     TEXT,
  -- Never cleared, so finishing a missed task later can't quietly repair a streak.
  missed_at        TEXT,
  reminded_at      TEXT,
  deleted_at       TEXT,
  CHECK (time IS NULL OR date IS NOT NULL),
  CHECK ((series_id IS NULL) = (occurrence_date IS NULL)),
  CHECK (status <> 'done' OR completed_at IS NOT NULL)
) STRICT;

-- One task per slot. Finished and moved occurrences keep theirs, so regenerating a series after
-- its pattern changes can't duplicate them.
CREATE UNIQUE INDEX tasks_series_occurrence
  ON tasks (series_id, occurrence_date)
  WHERE series_id IS NOT NULL;
CREATE INDEX tasks_by_date ON tasks (date, status) WHERE deleted_at IS NULL;
CREATE INDEX tasks_by_status ON tasks (status) WHERE deleted_at IS NULL;

CREATE TABLE activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  -- Snapshot, so the log still reads correctly if the task is later purged.
  task_title TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN (
               'created', 'completed', 'reopened', 'missed',
               'edited', 'rescheduled', 'deleted', 'restored')),
  from_date  TEXT,
  to_date    TEXT,
  -- JSON: {"field": [before, after]}
  changes    TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX activity_by_task ON activity_log (task_id, id);
CREATE INDEX activity_by_action ON activity_log (action, created_at);
CREATE INDEX activity_by_time ON activity_log (created_at);

-- A permanent record of how each finished day went, written once when the day closes. Streaks
-- read this instead of `tasks`, so moving a missed task later can't rewrite a past day.
CREATE TABLE day_ledger (
  date         TEXT PRIMARY KEY,
  due_count    INTEGER NOT NULL,
  done_count   INTEGER NOT NULL,
  missed_count INTEGER NOT NULL,
  closed_at    TEXT NOT NULL
) STRICT;

-- Values are JSON.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
