import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetDb, getDb, ensureAgent } from '../db.js';
import { getSession } from '../commands/session.js';
import { storeEvent, storeLesson, storePrinciple, storeSummary } from '../commands/store.js';
import { setState } from '../commands/state.js';

describe('session', () => {
  beforeEach(() => {
    resetDb(':memory:');
  });

  afterEach(() => {
    resetDb();
  });

  describe('getSession', () => {
    test('returns complete session object', () => {
      const session = getSession('new-agent');
      
      expect(session).toHaveProperty('state');
      expect(session).toHaveProperty('hot_events');
      expect(session).toHaveProperty('principles');
      expect(session).toHaveProperty('recent_summary');
      expect(session).toHaveProperty('recent_lessons');
      expect(session).toHaveProperty('counts');
    });

    test('creates agent if not exists', () => {
      getSession('brand-new-agent');
      
      const db = getDb();
      const agent = db.query('SELECT * FROM agents WHERE id = ?').get('brand-new-agent');
      
      expect(agent).toBeTruthy();
    });

    test('returns empty state for new agent', () => {
      const session = getSession('new-agent');
      
      expect(session.state.content).toBe('');
      expect(session.state.updated_at).toBeNull();
    });

    test('returns stored state', () => {
      setState('myagent', '## Current Focus\nBuilding tests');
      const session = getSession('myagent');
      
      expect(session.state.content).toBe('## Current Focus\nBuilding tests');
      expect(session.state.updated_at).toBeTruthy();
    });

    test('returns hot events only', () => {
      // Create events with different tiers
      storeEvent('myagent', { id: 'hot-1', type: 'work_session', title: 'Hot Event', content: 'Recent' });
      storeEvent('myagent', { id: 'hot-2', type: 'work_session', title: 'Another Hot', content: 'Also recent' });
      
      // Manually set one to warm
      const db = getDb();
      db.query("UPDATE events SET tier = 'warm' WHERE id = 'hot-2'").run();
      
      const session = getSession('myagent');
      
      expect(session.hot_events.length).toBe(1);
      expect(session.hot_events[0].id).toBe('hot-1');
    });

    test('limits hot events to 20', () => {
      // Create 25 hot events
      for (let i = 0; i < 25; i++) {
        storeEvent('myagent', { 
          id: `evt-${i}`, 
          type: 'work_session', 
          title: `Event ${i}`, 
          content: 'Content' 
        });
      }
      
      const session = getSession('myagent');
      
      expect(session.hot_events.length).toBe(20);
    });

    test('orders hot events by timestamp descending', () => {
      storeEvent('myagent', { id: 'e1', type: 'work_session', title: 'First', content: 'C', timestamp: '2026-01-29T10:00:00Z' });
      storeEvent('myagent', { id: 'e2', type: 'work_session', title: 'Second', content: 'C', timestamp: '2026-01-29T12:00:00Z' });
      storeEvent('myagent', { id: 'e3', type: 'work_session', title: 'Third', content: 'C', timestamp: '2026-01-29T11:00:00Z' });
      
      const session = getSession('myagent');
      
      expect(session.hot_events[0].id).toBe('e2');
      expect(session.hot_events[1].id).toBe('e3');
      expect(session.hot_events[2].id).toBe('e1');
    });

    test('returns all principles', () => {
      storePrinciple('myagent', { name: 'principle-1', content: 'First', source_lessons: [] });
      storePrinciple('myagent', { name: 'principle-2', content: 'Second', source_lessons: [] });
      storePrinciple('myagent', { name: 'principle-3', content: 'Third', source_lessons: [] });
      
      const session = getSession('myagent');
      
      expect(session.principles.length).toBe(3);
    });

    test('returns most recent summary', () => {
      // Store with explicit IDs that will have different created_at via insertion order
      // The storeSummary uses ON CONFLICT which preserves original created_at
      // So we need to use unique IDs to ensure both are inserted fresh
      const db = getDb();
      const older = '2026-01-28T10:00:00.000Z';
      const newer = '2026-01-29T10:00:00.000Z';
      
      db.query(`
        INSERT INTO summaries (id, agent_id, type, period, content, event_count, created_at)
        VALUES ('s1', 'myagent', 'week', '2026-W01', 'Week 1', 10, ?)
      `).run(older);
      
      db.query(`
        INSERT INTO summaries (id, agent_id, type, period, content, event_count, created_at)
        VALUES ('s2', 'myagent', 'week', '2026-W02', 'Week 2', 15, ?)
      `).run(newer);
      
      const session = getSession('myagent');
      
      expect(session.recent_summary).toBeTruthy();
      expect(session.recent_summary.period).toBe('2026-W02');
    });

    test('returns null when no summaries exist', () => {
      const session = getSession('myagent');
      
      expect(session.recent_summary).toBeNull();
    });

    test('returns recent unconsolidated lessons', () => {
      storeLesson('myagent', { id: 'l1', type: 'feedback', title: 'Lesson 1', content: 'C' });
      storeLesson('myagent', { id: 'l2', type: 'success', title: 'Lesson 2', content: 'C' });
      storeLesson('myagent', { id: 'l3', type: 'failure', title: 'Lesson 3', content: 'C', consolidated_to: 'principle-1' });
      
      const session = getSession('myagent');
      
      // Should only get unconsolidated lessons (l1 and l2)
      expect(session.recent_lessons.length).toBe(2);
      expect(session.recent_lessons.find(l => l.id === 'l3')).toBeUndefined();
    });

    test('limits recent lessons to 10', () => {
      for (let i = 0; i < 15; i++) {
        storeLesson('myagent', { 
          id: `lesson-${i}`, 
          type: 'observation', 
          title: `Lesson ${i}`, 
          content: 'Content' 
        });
      }
      
      const session = getSession('myagent');
      
      expect(session.recent_lessons.length).toBe(10);
    });

    test('orders recent lessons by timestamp descending', () => {
      storeLesson('myagent', { id: 'l1', type: 'feedback', title: 'Old', content: 'C', timestamp: '2026-01-28T10:00:00Z' });
      storeLesson('myagent', { id: 'l2', type: 'success', title: 'New', content: 'C', timestamp: '2026-01-29T10:00:00Z' });
      
      const session = getSession('myagent');
      
      expect(session.recent_lessons[0].id).toBe('l2');
      expect(session.recent_lessons[1].id).toBe('l1');
    });

    test('counts are accurate', () => {
      storeEvent('myagent', { id: 'e1', type: 'work_session', title: 'Event', content: 'C' });
      storeEvent('myagent', { id: 'e2', type: 'work_session', title: 'Event 2', content: 'C' });
      storePrinciple('myagent', { name: 'p1', content: 'Principle', source_lessons: [] });
      storeLesson('myagent', { id: 'l1', type: 'feedback', title: 'Lesson', content: 'C' });
      storeLesson('myagent', { id: 'l2', type: 'success', title: 'Lesson 2', content: 'C' });
      storeLesson('myagent', { id: 'l3', type: 'failure', title: 'Lesson 3', content: 'C' });
      
      const session = getSession('myagent');
      
      expect(session.counts.hot_events).toBe(2);
      expect(session.counts.principles).toBe(1);
      expect(session.counts.recent_lessons).toBe(3);
    });

    test('parses event metadata', () => {
      storeEvent('myagent', { 
        id: 'e-meta', 
        type: 'work_session', 
        title: 'With Meta', 
        content: 'C',
        metadata: { tags: ['test', 'memory'] }
      });
      
      const session = getSession('myagent');
      const event = session.hot_events.find(e => e.id === 'e-meta');
      
      expect(event.metadata).toEqual({ tags: ['test', 'memory'] });
    });

    test('parses principle source_lessons', () => {
      storePrinciple('myagent', { 
        name: 'p-sources', 
        content: 'Content', 
        source_lessons: ['l1', 'l2', 'l3'] 
      });
      
      const session = getSession('myagent');
      const principle = session.principles.find(p => p.name === 'p-sources');
      
      expect(principle.source_lessons).toEqual(['l1', 'l2', 'l3']);
    });

    test('parses lesson metadata', () => {
      storeLesson('myagent', { 
        id: 'l-meta', 
        type: 'observation', 
        title: 'With Meta', 
        content: 'C',
        metadata: { importance: 'high' }
      });
      
      const session = getSession('myagent');
      const lesson = session.recent_lessons.find(l => l.id === 'l-meta');
      
      expect(lesson.metadata).toEqual({ importance: 'high' });
    });

    test('isolates data by agent', () => {
      storeEvent('myagent', { id: 'my-evt', type: 'work_session', title: 'My Event', content: 'C' });
      storeEvent('otheragent', { id: 'other-evt', type: 'work_session', title: 'Other Event', content: 'C' });
      
      const mySession = getSession('myagent');
      const otherSession = getSession('otheragent');
      
      expect(mySession.hot_events.length).toBe(1);
      expect(mySession.hot_events[0].id).toBe('my-evt');
      
      expect(otherSession.hot_events.length).toBe(1);
      expect(otherSession.hot_events[0].id).toBe('other-evt');
    });

    test('handles empty database gracefully', () => {
      const session = getSession('empty-agent');
      
      expect(session.state.content).toBe('');
      expect(session.hot_events).toEqual([]);
      expect(session.principles).toEqual([]);
      expect(session.recent_summary).toBeNull();
      expect(session.recent_lessons).toEqual([]);
      expect(session.counts).toEqual({
        hot_events: 0,
        principles: 0,
        recent_lessons: 0
      });
    });
  });
});
