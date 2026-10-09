PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  barcode TEXT NOT NULL UNIQUE,
  total_quantity INTEGER NOT NULL CHECK(total_quantity >= 0),
  available_quantity INTEGER NOT NULL CHECK(available_quantity >= 0 AND available_quantity <= total_quantity),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  phone TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 一条借阅记录包含一次借书及后续的归还确认，确保历史记录可完整追溯。
CREATE TABLE IF NOT EXISTS borrow_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id),
  phone TEXT NOT NULL REFERENCES users(phone),
  borrower_name TEXT NOT NULL,
  borrowed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  return_requested_at TEXT,
  returned_at TEXT,
  status TEXT NOT NULL DEFAULT 'BORROWED' CHECK(status IN ('BORROWED', 'RETURN_PENDING', 'RETURNED'))
);

CREATE INDEX IF NOT EXISTS idx_records_phone ON borrow_records(phone, borrowed_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_status ON borrow_records(status, borrowed_at DESC);
