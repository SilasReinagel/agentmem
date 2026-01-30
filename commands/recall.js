import { getDb } from '../db.js';

export function recall(agentId, type, filters = {}, limit = 20) {
  const db = getDb();
  
  switch (type) {
    case 'events':
      return recallEvents(db, agentId, filters, limit);
    case 'entities':
      return recallEntities(db, agentId, filters, limit);
    case 'lessons':
      return recallLessons(db, agentId, filters, limit);
    case 'principles':
      return recallPrinciples(db, agentId, filters, limit);
    case 'summaries':
      return recallSummaries(db, agentId, filters, limit);
    default:
      throw new Error(`Unknown type: ${type}`);
  }
}

function recallEvents(db, agentId, filters, limit) {
  let sql = 'SELECT * FROM events WHERE agent_id = ?';
  const params = [agentId];
  
  if (filters.tier) {
    sql += ' AND tier = ?';
    params.push(filters.tier);
  }
  
  if (filters.event_type) {
    sql += ' AND type = ?';
    params.push(filters.event_type);
  }
  
  if (filters.since) {
    sql += ' AND timestamp >= ?';
    params.push(filters.since);
  }
  
  if (filters.until) {
    sql += ' AND timestamp <= ?';
    params.push(filters.until);
  }
  
  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  
  const rows = db.query(sql).all(...params);
  return rows.map(row => ({
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    title: row.title,
    content: row.content,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    tier: row.tier
  }));
}

function recallEntities(db, agentId, filters, limit) {
  let sql = 'SELECT * FROM entities WHERE agent_id = ?';
  const params = [agentId];
  
  if (filters.entity_type) {
    sql += ' AND type = ?';
    params.push(filters.entity_type);
  }
  
  sql += ' ORDER BY updated_at DESC LIMIT ?';
  params.push(limit);
  
  const rows = db.query(sql).all(...params);
  return rows.map(row => ({
    id: row.id,
    type: row.type,
    name: row.name,
    content: row.content,
    updated_at: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : {}
  }));
}

function recallLessons(db, agentId, filters, limit) {
  let sql = 'SELECT * FROM lessons WHERE agent_id = ?';
  const params = [agentId];
  
  if (filters.lesson_type) {
    sql += ' AND type = ?';
    params.push(filters.lesson_type);
  }
  
  if (filters.since) {
    sql += ' AND timestamp >= ?';
    params.push(filters.since);
  }
  
  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  
  const rows = db.query(sql).all(...params);
  return rows.map(row => ({
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    title: row.title,
    content: row.content,
    source_event_id: row.source_event_id,
    consolidated_to: row.consolidated_to,
    metadata: row.metadata ? JSON.parse(row.metadata) : {}
  }));
}

function recallPrinciples(db, agentId, filters, limit) {
  const sql = 'SELECT * FROM principles WHERE agent_id = ? ORDER BY updated_at DESC LIMIT ?';
  const rows = db.query(sql).all(agentId, limit);
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    content: row.content,
    source_lessons: row.source_lessons ? JSON.parse(row.source_lessons) : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : {}
  }));
}

function recallSummaries(db, agentId, filters, limit) {
  let sql = 'SELECT * FROM summaries WHERE agent_id = ?';
  const params = [agentId];
  
  if (filters.summary_type) {
    sql += ' AND type = ?';
    params.push(filters.summary_type);
  }
  
  if (filters.since) {
    sql += ' AND created_at >= ?';
    params.push(filters.since);
  }
  
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  
  const rows = db.query(sql).all(...params);
  return rows.map(row => ({
    id: row.id,
    type: row.type,
    period: row.period,
    content: row.content,
    event_count: row.event_count,
    created_at: row.created_at
  }));
}
