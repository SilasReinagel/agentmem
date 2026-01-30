import { getDb, ensureAgent } from '../db.js';

/**
 * Session initialization - returns everything needed to start a session in one call.
 * Combines: state, hot events, all principles, most recent summary, recent lessons.
 */
export function getSession(agentId) {
  ensureAgent(agentId);
  const db = getDb();
  
  // Get state
  const stateRow = db.query('SELECT content, updated_at FROM state WHERE agent_id = ?').get(agentId);
  const state = stateRow 
    ? { content: stateRow.content, updated_at: stateRow.updated_at }
    : { content: '', updated_at: null };
  
  // Get hot events (last 72 hours)
  const hotEvents = db.query(`
    SELECT id, type, timestamp, title, content, metadata, tier 
    FROM events 
    WHERE agent_id = ? AND tier = 'hot'
    ORDER BY timestamp DESC
    LIMIT 20
  `).all(agentId).map(row => ({
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    title: row.title,
    content: row.content,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    tier: row.tier
  }));
  
  // Get all principles
  const principles = db.query(`
    SELECT id, name, content, source_lessons, created_at, updated_at, metadata
    FROM principles
    WHERE agent_id = ?
    ORDER BY updated_at DESC
  `).all(agentId).map(row => ({
    id: row.id,
    name: row.name,
    content: row.content,
    source_lessons: row.source_lessons ? JSON.parse(row.source_lessons) : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : {}
  }));
  
  // Get most recent summary
  const summaryRow = db.query(`
    SELECT id, type, period, content, event_count, created_at
    FROM summaries
    WHERE agent_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(agentId);
  const recentSummary = summaryRow ? {
    id: summaryRow.id,
    type: summaryRow.type,
    period: summaryRow.period,
    content: summaryRow.content,
    event_count: summaryRow.event_count,
    created_at: summaryRow.created_at
  } : null;
  
  // Get recent lessons (unconsolidated, last 10)
  const recentLessons = db.query(`
    SELECT id, type, timestamp, title, content, source_event_id, consolidated_to, metadata
    FROM lessons
    WHERE agent_id = ? AND consolidated_to IS NULL
    ORDER BY timestamp DESC
    LIMIT 10
  `).all(agentId).map(row => ({
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    title: row.title,
    content: row.content,
    source_event_id: row.source_event_id,
    consolidated_to: row.consolidated_to,
    metadata: row.metadata ? JSON.parse(row.metadata) : {}
  }));
  
  return {
    state,
    hot_events: hotEvents,
    principles,
    recent_summary: recentSummary,
    recent_lessons: recentLessons,
    counts: {
      hot_events: hotEvents.length,
      principles: principles.length,
      recent_lessons: recentLessons.length
    }
  };
}
