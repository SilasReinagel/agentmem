import { getDb, ensureAgent } from '../db.js';

const BOOTSTRAP_EVENT_TYPES = ['work_session', 'finding', 'decision'];
const NOISE_EVENT_TYPES = ['tool_result', 'tool_call'];
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const STATE_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_LIMIT = 40;
const BOOTSTRAP_EVENT_LIMIT = 15;
const AUTO_TITLE_RE = /^(Task:|Session started:|Session ended:)/;

/**
 * Session initialization - returns everything needed to start a session in one call.
 * Combines: state, hot events, all principles, most recent summary, recent lessons.
 */
export function getSession(agentId, { format = 'compact' } = {}) {
  ensureAgent(agentId);
  const db = getDb();

  const state = queryState(db, agentId);
  const hotEvents = queryHotEvents(db, agentId);
  const principles = queryPrinciples(db, agentId);
  const recentSummary = queryRecentSummary(db, agentId);
  const recentLessons = queryRecentLessons(db, agentId);

  if (format === 'json') {
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

  return formatCompact({ state, hotEvents, principles, recentSummary, recentLessons });
}

function queryState(db, agentId) {
  const row = db.query('SELECT content, updated_at FROM state WHERE agent_id = ?').get(agentId);
  if (!row) {
    return {
      content: '',
      updated_at: null,
      stale: true,
      age_hours: null
    };
  }

  const ageMs = row.updated_at
    ? Date.now() - new Date(row.updated_at).getTime()
    : null;
  const stale = ageMs === null || ageMs > STATE_STALE_MS;
  const ageHours = ageMs === null ? null : Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10;

  return {
    content: row.content,
    updated_at: row.updated_at,
    stale,
    age_hours: ageHours
  };
}

function queryHotEvents(db, agentId) {
  const typePlaceholders = BOOTSTRAP_EVENT_TYPES.map(() => '?').join(',');
  const noisePlaceholders = NOISE_EVENT_TYPES.map(() => '?').join(',');
  const rows = db.query(`
    SELECT id, type, timestamp, title, content, metadata, tier
    FROM events
    WHERE agent_id = ?
      AND tier = 'hot'
      AND type IN (${typePlaceholders})
      AND type NOT IN (${noisePlaceholders})
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(agentId, ...BOOTSTRAP_EVENT_TYPES, ...NOISE_EVENT_TYPES, FETCH_LIMIT).map(row => ({
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    title: row.title,
    content: row.content,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    tier: row.tier
  }));

  return selectBootstrapEvents(rows);
}

/**
 * Prefer curated (manual) events over memsyncd auto-ingest, after 24h title dedupe.
 */
function selectBootstrapEvents(events) {
  const deduped = dedup(events);
  const curated = [];
  const auto = [];

  for (const event of deduped) {
    if (isAutoEvent(event)) {
      auto.push(event);
    } else {
      curated.push(event);
    }
  }

  const selected = [];
  for (const event of curated) {
    if (selected.length >= BOOTSTRAP_EVENT_LIMIT) break;
    selected.push(event);
  }
  for (const event of auto) {
    if (selected.length >= BOOTSTRAP_EVENT_LIMIT) break;
    selected.push(event);
  }

  // Keep newest-first order for display
  selected.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return selected;
}

function isAutoEvent(event) {
  const meta = event.metadata || {};
  if (meta.source_path || meta.source_file) return true;
  const title = (event.title || '').trim();
  return AUTO_TITLE_RE.test(title);
}

function queryPrinciples(db, agentId) {
  return db.query(`
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
}

function queryRecentSummary(db, agentId) {
  const row = db.query(`
    SELECT id, type, period, content, event_count, created_at
    FROM summaries
    WHERE agent_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(agentId);

  return row ? {
    id: row.id,
    type: row.type,
    period: row.period,
    content: row.content,
    event_count: row.event_count,
    created_at: row.created_at
  } : null;
}

function queryRecentLessons(db, agentId) {
  return db.query(`
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
}

/**
 * Normalize titles so truncated Task: prompts and trailing ellipses collapse.
 */
function dedupeKey(title) {
  return (title || '')
    .trim()
    .replace(/\.{2,}$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Dedup events with identical (normalized) titles within DEDUP_WINDOW_MS.
 * Keeps the most recent occurrence. Input is newest-first.
 */
function dedup(events) {
  const seen = new Map();
  const result = [];

  for (const event of events) {
    const key = dedupeKey(event.title);
    const ts = new Date(event.timestamp).getTime();
    const prev = seen.get(key);

    if (prev !== undefined && Math.abs(ts - prev) < DEDUP_WINDOW_MS) {
      continue;
    }
    seen.set(key, ts);
    result.push(event);
  }
  return result;
}

function shortDate(isoString) {
  if (!isoString) return '?';
  const d = new Date(isoString);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = months[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mon}${day} ${hh}:${mm}`;
}

function shortDateOnly(isoString) {
  if (!isoString) return '?';
  const d = new Date(isoString);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]}${String(d.getDate()).padStart(2, '0')}`;
}

function firstSentence(text) {
  if (!text) return '';
  const match = text.match(/^(.+?[.!?])\s/);
  return match ? match[1] : text.slice(0, 120);
}

function titleOrContent(event) {
  const t = (event.title || '').trim();
  const c = (event.content || '').trim();
  if (!c || c === t || c.startsWith(t)) return t;
  if (t.length > 60) return t;
  return t;
}

function formatCompact({ state, hotEvents, principles, recentSummary, recentLessons }) {
  const lines = [];

  // State
  const stateAge = state.updated_at ? shortDateOnly(state.updated_at) : 'never';
  lines.push(`=STATE (${stateAge})=`);
  if (state.stale) {
    lines.push('! STALE STATE (>24h) — update with: bun index.js state --user=andrii "..."');
  }
  lines.push(state.content || '(empty)');
  lines.push('');

  // Events
  if (hotEvents.length > 0) {
    lines.push(`=EVENTS (${hotEvents.length})=`);
    for (const e of hotEvents) {
      lines.push(`${shortDate(e.timestamp)} | ${e.type} | ${titleOrContent(e)}`);
    }
    lines.push('');
  }

  // Principles
  if (principles.length > 0) {
    lines.push(`=PRINCIPLES (${principles.length})=`);
    for (const p of principles) {
      lines.push(`- ${p.name}: ${firstSentence(p.content)}`);
    }
    lines.push('');
  }

  // Summary
  if (recentSummary) {
    lines.push('=SUMMARY=');
    lines.push(recentSummary.content);
    lines.push('');
  }

  // Lessons
  if (recentLessons.length > 0) {
    lines.push(`=LESSONS (${recentLessons.length})=`);
    for (const l of recentLessons) {
      lines.push(`${shortDateOnly(l.timestamp)} | ${l.type} | ${l.title}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
