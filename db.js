import { Database } from 'bun:sqlite';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

const SCHEMA_VERSION = 1;

// Default paths (used when AGENTMEM_DB_PATH not set)
const DEFAULT_DB_DIR = join(homedir(), '.agentmem');
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'memory.db');

let db = null;
let currentDbPath = null;

/**
 * Get the database path from environment or default
 */
function getDbPath() {
  return process.env.AGENTMEM_DB_PATH || DEFAULT_DB_PATH;
}

/**
 * Reset the database connection (for testing)
 * Call with no args to close, or with a path to switch databases
 */
export function resetDb(newPath = null) {
  if (db) {
    db.close();
    db = null;
    currentDbPath = null;
  }
  if (newPath !== null) {
    process.env.AGENTMEM_DB_PATH = newPath;
  }
}

export function getDb() {
  const dbPath = getDbPath();
  
  // If path changed, close old connection
  if (db && currentDbPath !== dbPath) {
    db.close();
    db = null;
  }
  
  if (!db) {
    // Ensure directory exists (unless :memory:)
    if (dbPath !== ':memory:') {
      const dbDir = dirname(dbPath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }
    }
    
    db = new Database(dbPath);
    currentDbPath = dbPath;
    
    // WAL mode not supported for :memory:
    if (dbPath !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL');
    }
    
    // Only initialize schema if needed
    const versionRow = db.query('PRAGMA user_version').get();
    const currentVersion = versionRow?.user_version ?? 0;
    
    if (currentVersion < SCHEMA_VERSION) {
      initializeSchema(db);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }
  }
  return db;
}

function initializeSchema(db) {
  // Core tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      tier TEXT DEFAULT 'hot',
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_event_id TEXT,
      consolidated_to TEXT,
      metadata TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS principles (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      source_lessons TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      period TEXT NOT NULL,
      content TEXT NOT NULL,
      event_count INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS state (
      agent_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    -- Full-text search (FTS5)
    CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
      title, content,
      content=events, content_rowid=rowid
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
      name, content,
      content=entities, content_rowid=rowid
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS lessons_fts USING fts5(
      title, content,
      content=lessons, content_rowid=rowid
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_events_agent_timestamp ON events(agent_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_events_tier ON events(tier);
    CREATE INDEX IF NOT EXISTS idx_lessons_agent ON lessons(agent_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_entities_agent_type ON entities(agent_id, type);
  `);
}

export function ensureAgent(agentId) {
  const db = getDb();
  const existing = db.query('SELECT id FROM agents WHERE id = ?').get(agentId);
  if (!existing) {
    db.query('INSERT INTO agents (id, created_at) VALUES (?, ?)')
      .run(agentId, new Date().toISOString());
  }
}

export function updateTiers() {
  const db = getDb();
  const now = new Date();
  const hotThreshold = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
  const warmThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  db.query(`
    UPDATE events 
    SET tier = CASE
      WHEN timestamp < ? THEN 'cold'
      WHEN timestamp < ? THEN 'warm'
      ELSE 'hot'
    END
  `).run(warmThreshold, hotThreshold);
}
