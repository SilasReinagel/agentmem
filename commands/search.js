import { getDb } from '../db.js';

export function search(agentId, queryText, types = ['events', 'entities', 'lessons'], limit = 10) {
  const db = getDb();
  const results = [];
  
  if (types.includes('events')) {
    const events = db.query(`
      SELECT e.*, 
             rank AS score
      FROM events_fts
      JOIN events e ON e.rowid = events_fts.rowid
      WHERE e.agent_id = ? AND events_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(agentId, queryText, limit);
    
    results.push(...events.map(e => ({
      type: 'event',
      id: e.id,
      title: e.title,
      snippet: extractSnippet(e.content, queryText),
      score: e.score,
      timestamp: e.timestamp
    })));
  }
  
  if (types.includes('entities')) {
    const entities = db.query(`
      SELECT e.*,
             rank AS score
      FROM entities_fts
      JOIN entities e ON e.rowid = entities_fts.rowid
      WHERE e.agent_id = ? AND entities_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(agentId, queryText, limit);
    
    results.push(...entities.map(e => ({
      type: 'entity',
      id: e.id,
      title: e.name,
      snippet: extractSnippet(e.content, queryText),
      score: e.score,
      updated_at: e.updated_at
    })));
  }
  
  if (types.includes('lessons')) {
    const lessons = db.query(`
      SELECT l.*,
             rank AS score
      FROM lessons_fts
      JOIN lessons l ON l.rowid = lessons_fts.rowid
      WHERE l.agent_id = ? AND lessons_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(agentId, queryText, limit);
    
    results.push(...lessons.map(l => ({
      type: 'lesson',
      id: l.id,
      title: l.title,
      snippet: extractSnippet(l.content, queryText),
      score: l.score,
      timestamp: l.timestamp
    })));
  }
  
  // Sort by score and limit
  return results
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

function extractSnippet(text, queryText, length = 150) {
  const terms = queryText.toLowerCase().split(/\s+/);
  const lowerText = text.toLowerCase();
  
  // Find first occurrence of any term
  let pos = -1;
  for (const term of terms) {
    const idx = lowerText.indexOf(term);
    if (idx !== -1 && (pos === -1 || idx < pos)) {
      pos = idx;
    }
  }
  
  if (pos === -1) {
    return text.substring(0, length) + '...';
  }
  
  const start = Math.max(0, pos - length / 2);
  const end = Math.min(text.length, pos + length / 2);
  
  let snippet = text.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  
  return snippet;
}
