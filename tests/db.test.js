import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getDb, resetDb, ensureAgent, updateTiers } from '../db.js';

describe('db', () => {
  beforeEach(() => {
    // Fresh in-memory database for each test
    resetDb(':memory:');
  });

  afterEach(() => {
    resetDb();
  });

  describe('getDb', () => {
    test('creates database with schema', () => {
      const db = getDb();
      
      // Check tables exist
      const tables = db.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all();
      
      const tableNames = tables.map(t => t.name).sort();
      expect(tableNames).toContain('agents');
      expect(tableNames).toContain('events');
      expect(tableNames).toContain('entities');
      expect(tableNames).toContain('lessons');
      expect(tableNames).toContain('principles');
      expect(tableNames).toContain('summaries');
      expect(tableNames).toContain('state');
    });

    test('creates FTS tables', () => {
      const db = getDb();
      
      const tables = db.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE '%_fts%'
      `).all();
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('events_fts');
      expect(tableNames).toContain('entities_fts');
      expect(tableNames).toContain('lessons_fts');
    });

    test('creates indexes', () => {
      const db = getDb();
      
      const indexes = db.query(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name LIKE 'idx_%'
      `).all();
      
      const indexNames = indexes.map(i => i.name);
      expect(indexNames).toContain('idx_events_agent_timestamp');
      expect(indexNames).toContain('idx_events_tier');
      expect(indexNames).toContain('idx_lessons_agent');
      expect(indexNames).toContain('idx_entities_agent_type');
    });

    test('sets schema version', () => {
      const db = getDb();
      const version = db.query('PRAGMA user_version').get();
      expect(version.user_version).toBe(1);
    });

    test('returns same connection on subsequent calls', () => {
      const db1 = getDb();
      const db2 = getDb();
      expect(db1).toBe(db2);
    });
  });

  describe('ensureAgent', () => {
    test('creates new agent', () => {
      ensureAgent('test-agent');
      
      const db = getDb();
      const agent = db.query('SELECT * FROM agents WHERE id = ?').get('test-agent');
      
      expect(agent).not.toBeNull();
      expect(agent.id).toBe('test-agent');
      expect(agent.created_at).toBeTruthy();
    });

    test('does not duplicate existing agent', () => {
      ensureAgent('test-agent');
      ensureAgent('test-agent');
      
      const db = getDb();
      const count = db.query('SELECT COUNT(*) as c FROM agents WHERE id = ?').get('test-agent');
      
      expect(count.c).toBe(1);
    });

    test('creates multiple different agents', () => {
      ensureAgent('agent1');
      ensureAgent('agent2');
      
      const db = getDb();
      const count = db.query('SELECT COUNT(*) as c FROM agents').get();
      
      expect(count.c).toBe(2);
    });
  });

  describe('updateTiers', () => {
    test('moves old events to warm tier', () => {
      ensureAgent('test');
      const db = getDb();
      
      // Insert event from 5 days ago (should be warm: >72h but <30d)
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      db.query(`
        INSERT INTO events (id, agent_id, type, timestamp, title, content, tier)
        VALUES ('old-event', 'test', 'work_session', ?, 'Old Event', 'Content', 'hot')
      `).run(fiveDaysAgo);
      
      updateTiers();
      
      const event = db.query('SELECT tier FROM events WHERE id = ?').get('old-event');
      expect(event.tier).toBe('warm');
    });

    test('moves very old events to cold tier', () => {
      ensureAgent('test');
      const db = getDb();
      
      // Insert event from 45 days ago (should be cold: >30d)
      const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      db.query(`
        INSERT INTO events (id, agent_id, type, timestamp, title, content, tier)
        VALUES ('ancient-event', 'test', 'work_session', ?, 'Ancient Event', 'Content', 'hot')
      `).run(fortyFiveDaysAgo);
      
      updateTiers();
      
      const event = db.query('SELECT tier FROM events WHERE id = ?').get('ancient-event');
      expect(event.tier).toBe('cold');
    });

    test('keeps recent events hot', () => {
      ensureAgent('test');
      const db = getDb();
      
      // Insert event from 1 hour ago (should stay hot)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      db.query(`
        INSERT INTO events (id, agent_id, type, timestamp, title, content, tier)
        VALUES ('recent-event', 'test', 'work_session', ?, 'Recent Event', 'Content', 'hot')
      `).run(oneHourAgo);
      
      updateTiers();
      
      const event = db.query('SELECT tier FROM events WHERE id = ?').get('recent-event');
      expect(event.tier).toBe('hot');
    });

    test('handles 72-hour boundary correctly', () => {
      ensureAgent('test');
      const db = getDb();
      
      // Just under 72 hours = hot
      const just71h = new Date(Date.now() - 71 * 60 * 60 * 1000).toISOString();
      db.query(`
        INSERT INTO events (id, agent_id, type, timestamp, title, content, tier)
        VALUES ('under-72h', 'test', 'work_session', ?, 'Under 72h', 'Content', 'warm')
      `).run(just71h);
      
      // Just over 72 hours = warm
      const just73h = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
      db.query(`
        INSERT INTO events (id, agent_id, type, timestamp, title, content, tier)
        VALUES ('over-72h', 'test', 'work_session', ?, 'Over 72h', 'Content', 'hot')
      `).run(just73h);
      
      updateTiers();
      
      const under = db.query('SELECT tier FROM events WHERE id = ?').get('under-72h');
      const over = db.query('SELECT tier FROM events WHERE id = ?').get('over-72h');
      
      expect(under.tier).toBe('hot');
      expect(over.tier).toBe('warm');
    });
  });

  describe('resetDb', () => {
    test('closes connection and allows new one', () => {
      const db1 = getDb();
      resetDb(':memory:');
      const db2 = getDb();
      
      expect(db1).not.toBe(db2);
    });

    test('can switch database paths', () => {
      // First database
      resetDb(':memory:');
      ensureAgent('agent1');
      
      // Switch to new database
      resetDb(':memory:');
      const db = getDb();
      
      // New database should be empty
      const count = db.query('SELECT COUNT(*) as c FROM agents').get();
      expect(count.c).toBe(0);
    });
  });
});
