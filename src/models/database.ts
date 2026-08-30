import Database from "better-sqlite3";
import { DATABASE_URL } from "../config";
import { mkdirSync } from "fs";
import { dirname } from "path";

mkdirSync(dirname(DATABASE_URL), { recursive: true });

export const db = new Database(DATABASE_URL);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  telegram_id INTEGER,
  balance INTEGER DEFAULT 0,
  pending_balance INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  total_withdrawn INTEGER DEFAULT 0,
  referred_by TEXT,
  is_advertiser INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  banned INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  advertiser_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  reward INTEGER NOT NULL,
  user_reward INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  total_slots INTEGER NOT NULL,
  remaining_slots INTEGER NOT NULL,
  requires_proof INTEGER DEFAULT 0,
  proof_instructions TEXT,
  status TEXT DEFAULT 'pending_review',
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  FOREIGN KEY (advertiser_id) REFERENCES advertisers(id)
);

CREATE TABLE IF NOT EXISTS task_completions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  proof_text TEXT,
  proof_image TEXT,
  reward INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  review_note TEXT,
  UNIQUE(task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  final_amount INTEGER NOT NULL,
  wallet TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  processed_at INTEGER,
  tx_hash TEXT,
  reject_reason TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS advertisers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  balance INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS referrals (
  referrer_id TEXT NOT NULL,
  referred_id TEXT NOT NULL PRIMARY KEY,
  bonus_paid INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (referrer_id) REFERENCES users(id),
  FOREIGN KEY (referred_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_completions_user ON task_completions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_completions_task ON task_completions(task_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
`);

export function closeDb() {
  db.close();
}
