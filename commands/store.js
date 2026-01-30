import { getDb, ensureAgent } from '../db.js';

export function storeEvent(agentId, data) {
  ensureAgent(agentId);
  const db = getDb();
  
  const id = data.id || generateId(db, 'event');
  const timestamp = data.timestamp || new Date().toISOString();
  
  // Check if exists (fetch old values for FTS update)
  const existing = db.query('SELECT rowid, title, content FROM events WHERE id = ?').get(id);
  
  if (existing) {
    // Remove old entry from FTS (requires old values for external content tables)
    db.query("INSERT INTO events_fts(events_fts, rowid, title, content) VALUES('delete', ?, ?, ?)").run(
      existing.rowid,
      existing.title,
      existing.content
    );
    
    // Update existing
    db.query(`
      UPDATE events
      SET type = ?, timestamp = ?, title = ?, content = ?, metadata = ?
      WHERE id = ?
    `).run(
      data.type,
      timestamp,
      data.title,
      data.content,
      JSON.stringify(data.metadata || {}),
      id
    );
    
    // Add new entry to FTS
    db.query(`
      INSERT INTO events_fts (rowid, title, content)
      VALUES (?, ?, ?)
    `).run(existing.rowid, data.title, data.content);
  } else {
    // Insert new
    db.query(`
      INSERT INTO events (id, agent_id, type, timestamp, title, content, metadata, tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'hot')
    `).run(
      id,
      agentId,
      data.type,
      timestamp,
      data.title,
      data.content,
      JSON.stringify(data.metadata || {})
    );
    
    // Update FTS index
    const rowid = db.query('SELECT rowid FROM events WHERE id = ?').get(id).rowid;
    db.query(`
      INSERT INTO events_fts (rowid, title, content)
      VALUES (?, ?, ?)
    `).run(rowid, data.title, data.content);
  }
  
  return { id, timestamp };
}

export function storeEntity(agentId, data) {
  ensureAgent(agentId);
  const db = getDb();
  
  const id = data.id || `${agentId}/${data.type}s/${data.name}`;
  const now = new Date().toISOString();
  
  const existing = db.query('SELECT rowid, name, content FROM entities WHERE id = ?').get(id);
  
  if (existing) {
    // Remove old entry from FTS
    db.query("INSERT INTO entities_fts(entities_fts, rowid, name, content) VALUES('delete', ?, ?, ?)").run(
      existing.rowid,
      existing.name,
      existing.content
    );
    
    // Update
    db.query(`
      UPDATE entities
      SET content = ?, updated_at = ?, metadata = ?
      WHERE id = ?
    `).run(
      data.content,
      now,
      JSON.stringify(data.metadata || {}),
      id
    );
    
    // Add new entry to FTS
    db.query(`
      INSERT INTO entities_fts (rowid, name, content)
      VALUES (?, ?, ?)
    `).run(existing.rowid, data.name, data.content);
  } else {
    // Insert
    db.query(`
      INSERT INTO entities (id, agent_id, type, name, content, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      agentId,
      data.type,
      data.name,
      data.content,
      now,
      JSON.stringify(data.metadata || {})
    );
    
    // Insert FTS
    const rowid = db.query('SELECT rowid FROM entities WHERE id = ?').get(id).rowid;
    db.query(`
      INSERT INTO entities_fts (rowid, name, content)
      VALUES (?, ?, ?)
    `).run(rowid, data.name, data.content);
  }
  
  return { id, updated_at: now };
}

export function storeLesson(agentId, data) {
  ensureAgent(agentId);
  const db = getDb();
  
  const id = data.id || generateId(db, 'lesson');
  const timestamp = data.timestamp || new Date().toISOString();
  
  const existing = db.query('SELECT rowid, title, content FROM lessons WHERE id = ?').get(id);
  
  if (existing) {
    // Remove old entry from FTS
    db.query("INSERT INTO lessons_fts(lessons_fts, rowid, title, content) VALUES('delete', ?, ?, ?)").run(
      existing.rowid,
      existing.title,
      existing.content
    );
    
    // Update
    db.query(`
      UPDATE lessons
      SET type = ?, timestamp = ?, title = ?, content = ?, source_event_id = ?, consolidated_to = ?, metadata = ?
      WHERE id = ?
    `).run(
      data.type,
      timestamp,
      data.title,
      data.content,
      data.source_event_id || null,
      data.consolidated_to || null,
      JSON.stringify(data.metadata || {}),
      id
    );
    
    // Add new entry to FTS
    db.query(`
      INSERT INTO lessons_fts (rowid, title, content)
      VALUES (?, ?, ?)
    `).run(existing.rowid, data.title, data.content);
  } else {
    // Insert
    db.query(`
      INSERT INTO lessons (id, agent_id, type, timestamp, title, content, source_event_id, consolidated_to, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      agentId,
      data.type,
      timestamp,
      data.title,
      data.content,
      data.source_event_id || null,
      data.consolidated_to || null,
      JSON.stringify(data.metadata || {})
    );
    
    // Update FTS
    const rowid = db.query('SELECT rowid FROM lessons WHERE id = ?').get(id).rowid;
    db.query(`
      INSERT INTO lessons_fts (rowid, title, content)
      VALUES (?, ?, ?)
    `).run(rowid, data.title, data.content);
  }
  
  return { id, timestamp };
}

export function storePrinciple(agentId, data) {
  ensureAgent(agentId);
  const db = getDb();
  
  const id = data.id || `${agentId}/${data.name}`;
  const now = new Date().toISOString();
  
  const existing = db.query('SELECT id FROM principles WHERE id = ?').get(id);
  
  if (existing) {
    db.query(`
      UPDATE principles
      SET content = ?, source_lessons = ?, updated_at = ?, metadata = ?
      WHERE id = ?
    `).run(
      data.content,
      JSON.stringify(data.source_lessons || []),
      now,
      JSON.stringify(data.metadata || {}),
      id
    );
  } else {
    db.query(`
      INSERT INTO principles (id, agent_id, name, content, source_lessons, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      agentId,
      data.name,
      data.content,
      JSON.stringify(data.source_lessons || []),
      now,
      now,
      JSON.stringify(data.metadata || {})
    );
  }
  
  return { id, updated_at: now };
}

export function storeSummary(agentId, data) {
  ensureAgent(agentId);
  const db = getDb();
  
  const id = data.id || `${agentId}/${data.type}s/${data.period}`;
  const now = new Date().toISOString();
  
  db.query(`
    INSERT INTO summaries (id, agent_id, type, period, content, event_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      event_count = excluded.event_count
  `).run(
    id,
    agentId,
    data.type,
    data.period,
    data.content,
    data.event_count || 0,
    now
  );
  
  return { id, created_at: now };
}

function generateId(db, prefix) {
  const date = new Date().toISOString().split('T')[0];
  
  // Get max sequence for today
  const max = db.query(`
    SELECT id FROM ${prefix === 'event' ? 'events' : 'lessons'}
    WHERE id LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(`${date}-%`);
  
  let seq = 1;
  if (max) {
    const parts = max.id.split('-');
    seq = parseInt(parts[parts.length - 1]) + 1;
  }
  
  return `${date}-${String(seq).padStart(3, '0')}`;
}
