import { getDb } from '../db.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function exportMemory(agentId, targetDir, options = {}) {
  const db = getDb();
  const types = options.types || ['events', 'entities', 'lessons', 'principles', 'summaries'];
  const since = options.since;
  
  let filesWritten = 0;
  
  // Create directory structure
  mkdirSync(targetDir, { recursive: true });
  
  if (types.includes('events')) {
    let sql = 'SELECT * FROM events WHERE agent_id = ?';
    const params = [agentId];
    if (since) {
      sql += ' AND timestamp >= ?';
      params.push(since);
    }
    sql += ' ORDER BY timestamp DESC';
    
    const events = db.query(sql).all(...params);
    const eventsDir = join(targetDir, 'events');
    mkdirSync(eventsDir, { recursive: true });
    
    for (const event of events) {
      const content = formatEvent(event);
      writeFileSync(join(eventsDir, `${event.id}.md`), content);
      filesWritten++;
    }
  }
  
  if (types.includes('entities')) {
    let sql = 'SELECT * FROM entities WHERE agent_id = ?';
    const params = [agentId];
    if (since) {
      sql += ' AND updated_at >= ?';
      params.push(since);
    }
    sql += ' ORDER BY type, name';
    
    const entities = db.query(sql).all(...params);
    const entitiesDir = join(targetDir, 'entities');
    
    for (const entity of entities) {
      const typeDir = join(entitiesDir, `${entity.type}s`);
      mkdirSync(typeDir, { recursive: true });
      const content = formatEntity(entity);
      writeFileSync(join(typeDir, `${entity.name}.md`), content);
      filesWritten++;
    }
  }
  
  if (types.includes('lessons')) {
    let sql = 'SELECT * FROM lessons WHERE agent_id = ?';
    const params = [agentId];
    if (since) {
      sql += ' AND timestamp >= ?';
      params.push(since);
    }
    sql += ' ORDER BY timestamp DESC';
    
    const lessons = db.query(sql).all(...params);
    const lessonsDir = join(targetDir, 'lessons');
    mkdirSync(lessonsDir, { recursive: true });
    
    for (const lesson of lessons) {
      const content = formatLesson(lesson);
      writeFileSync(join(lessonsDir, `${lesson.id}.md`), content);
      filesWritten++;
    }
  }
  
  if (types.includes('principles')) {
    const principles = db.query('SELECT * FROM principles WHERE agent_id = ? ORDER BY name').all(agentId);
    const principlesDir = join(targetDir, 'principles');
    mkdirSync(principlesDir, { recursive: true });
    
    for (const principle of principles) {
      const content = formatPrinciple(principle);
      const name = principle.name.replace(/\//g, '-');
      writeFileSync(join(principlesDir, `${name}.md`), content);
      filesWritten++;
    }
  }
  
  if (types.includes('summaries')) {
    let sql = 'SELECT * FROM summaries WHERE agent_id = ?';
    const params = [agentId];
    if (since) {
      sql += ' AND created_at >= ?';
      params.push(since);
    }
    sql += ' ORDER BY type, period DESC';
    
    const summaries = db.query(sql).all(...params);
    const summariesDir = join(targetDir, 'summaries');
    
    for (const summary of summaries) {
      const typeDir = join(summariesDir, summary.type === 'week' ? 'weeks' : 'months');
      mkdirSync(typeDir, { recursive: true });
      const content = formatSummary(summary);
      const filename = summary.period.replace(/[^a-zA-Z0-9-]/g, '-');
      writeFileSync(join(typeDir, `${filename}.md`), content);
      filesWritten++;
    }
  }
  
  // Export state
  const state = db.query('SELECT * FROM state WHERE agent_id = ?').get(agentId);
  if (state) {
    writeFileSync(join(targetDir, 'state.md'), state.content);
    filesWritten++;
  }
  
  return { files_written: filesWritten, path: targetDir };
}

function formatEvent(event) {
  const metadata = event.metadata ? JSON.parse(event.metadata) : {};
  return `# ${event.title}

**Type:** ${event.type}
**Time:** ${event.timestamp}
**Tier:** ${event.tier}

${metadata.tags ? `**Tags:** ${metadata.tags.join(', ')}\n` : ''}

${event.content}
`;
}

function formatEntity(entity) {
  const metadata = entity.metadata ? JSON.parse(entity.metadata) : {};
  return `# ${entity.name}

**Type:** ${entity.type}
**Updated:** ${entity.updated_at}

${entity.content}
`;
}

function formatLesson(lesson) {
  const metadata = lesson.metadata ? JSON.parse(lesson.metadata) : {};
  return `# ${lesson.title}

**Type:** ${lesson.type}
**Time:** ${lesson.timestamp}
${lesson.source_event_id ? `**Source:** [[../events/${lesson.source_event_id}]]\n` : ''}

${lesson.content}
`;
}

function formatPrinciple(principle) {
  const sourceLessons = principle.source_lessons ? JSON.parse(principle.source_lessons) : [];
  return `# ${principle.name}

**Created:** ${principle.created_at}
**Updated:** ${principle.updated_at}

${principle.content}

${sourceLessons.length > 0 ? `\n## Source Lessons\n${sourceLessons.map(id => `- [[../lessons/${id}]]`).join('\n')}\n` : ''}
`;
}

function formatSummary(summary) {
  return `# ${summary.type === 'week' ? 'Week' : 'Month'} ${summary.period}

**Period:** ${summary.period}
**Events:** ${summary.event_count}
**Generated:** ${summary.created_at}

${summary.content}
`;
}
