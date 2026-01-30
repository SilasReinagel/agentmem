import { getDb, ensureAgent } from '../db.js';

export function getState(agentId) {
  ensureAgent(agentId);
  const db = getDb();
  const state = db.query('SELECT content, updated_at FROM state WHERE agent_id = ?').get(agentId);
  
  if (!state) {
    return { content: '', updated_at: null };
  }
  
  return {
    content: state.content,
    updated_at: state.updated_at
  };
}

export function setState(agentId, content) {
  ensureAgent(agentId);
  const db = getDb();
  const now = new Date().toISOString();
  
  db.query(`
    INSERT INTO state (agent_id, content, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET
      content = excluded.content,
      updated_at = excluded.updated_at
  `).run(agentId, content, now);
  
  return { updated_at: now };
}
