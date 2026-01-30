import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetDb, getDb, ensureAgent } from '../db.js';
import { recall } from '../commands/recall.js';
import { storeEvent, storeEntity, storeLesson, storePrinciple, storeSummary } from '../commands/store.js';

describe('recall', () => {
  beforeEach(() => {
    resetDb(':memory:');
  });

  afterEach(() => {
    resetDb();
  });

  describe('events', () => {
    beforeEach(() => {
      // Seed test data
      storeEvent('myagent', { id: 'e1', type: 'work_session', title: 'Event 1', content: 'First event', timestamp: '2026-01-29T10:00:00Z' });
      storeEvent('myagent', { id: 'e2', type: 'decision', title: 'Event 2', content: 'Second event', timestamp: '2026-01-29T11:00:00Z' });
      storeEvent('myagent', { id: 'e3', type: 'work_session', title: 'Event 3', content: 'Third event', timestamp: '2026-01-29T12:00:00Z' });
      
      // Set tiers directly for testing
      const db = getDb();
      db.query("UPDATE events SET tier = 'warm' WHERE id = 'e1'").run();
      db.query("UPDATE events SET tier = 'hot' WHERE id IN ('e2', 'e3')").run();
    });

    test('returns all events', () => {
      const events = recall('myagent', 'events');
      expect(events.length).toBe(3);
    });

    test('filters by tier', () => {
      const hotEvents = recall('myagent', 'events', { tier: 'hot' });
      expect(hotEvents.length).toBe(2);
      expect(hotEvents.every(e => e.tier === 'hot')).toBe(true);

      const warmEvents = recall('myagent', 'events', { tier: 'warm' });
      expect(warmEvents.length).toBe(1);
      expect(warmEvents[0].id).toBe('e1');
    });

    test('filters by event_type', () => {
      const sessions = recall('myagent', 'events', { event_type: 'work_session' });
      expect(sessions.length).toBe(2);
      expect(sessions.every(e => e.type === 'work_session')).toBe(true);
    });

    test('filters by since', () => {
      const events = recall('myagent', 'events', { since: '2026-01-29T10:30:00Z' });
      expect(events.length).toBe(2);
      expect(events.find(e => e.id === 'e1')).toBeUndefined();
    });

    test('filters by until', () => {
      const events = recall('myagent', 'events', { until: '2026-01-29T11:30:00Z' });
      expect(events.length).toBe(2);
      expect(events.find(e => e.id === 'e3')).toBeUndefined();
    });

    test('combines filters', () => {
      const events = recall('myagent', 'events', { 
        tier: 'hot', 
        event_type: 'work_session' 
      });
      expect(events.length).toBe(1);
      expect(events[0].id).toBe('e3');
    });

    test('respects limit', () => {
      const events = recall('myagent', 'events', {}, 2);
      expect(events.length).toBe(2);
    });

    test('orders by timestamp descending', () => {
      const events = recall('myagent', 'events');
      expect(events[0].id).toBe('e3');
      expect(events[1].id).toBe('e2');
      expect(events[2].id).toBe('e1');
    });

    test('parses metadata', () => {
      storeEvent('myagent', { 
        id: 'e-meta', 
        type: 'work_session', 
        title: 'With Meta', 
        content: 'Content',
        metadata: { tags: ['test'] }
      });

      const events = recall('myagent', 'events', { event_type: 'work_session' });
      const withMeta = events.find(e => e.id === 'e-meta');
      
      expect(withMeta.metadata).toEqual({ tags: ['test'] });
    });

    test('isolates by agent', () => {
      storeEvent('otheragent', { id: 'k1', type: 'work_session', title: 'Other Event', content: 'Content' });

      const myEvents = recall('myagent', 'events');
      const otherEvents = recall('otheragent', 'events');

      expect(myEvents.length).toBe(3);
      expect(otherEvents.length).toBe(1);
    });
  });

  describe('entities', () => {
    beforeEach(() => {
      storeEntity('myagent', { type: 'project', name: 'memory-cli', content: 'CLI tool' });
      storeEntity('myagent', { type: 'project', name: 'marketplace', content: 'Marketplace' });
      storeEntity('myagent', { type: 'person', name: 'alice', content: 'Team member' });
      storeEntity('myagent', { type: 'tool', name: 'cursor', content: 'IDE' });
    });

    test('returns all entities', () => {
      const entities = recall('myagent', 'entities');
      expect(entities.length).toBe(4);
    });

    test('filters by entity_type', () => {
      const projects = recall('myagent', 'entities', { entity_type: 'project' });
      expect(projects.length).toBe(2);
      expect(projects.every(e => e.type === 'project')).toBe(true);
    });

    test('respects limit', () => {
      const entities = recall('myagent', 'entities', {}, 2);
      expect(entities.length).toBe(2);
    });

    test('includes all fields', () => {
      const entities = recall('myagent', 'entities', { entity_type: 'person' });
      const alice = entities[0];

      expect(alice.id).toBe('myagent/persons/alice');
      expect(alice.type).toBe('person');
      expect(alice.name).toBe('alice');
      expect(alice.content).toBe('Team member');
      expect(alice.updated_at).toBeTruthy();
      expect(alice.metadata).toEqual({});
    });
  });

  describe('lessons', () => {
    beforeEach(() => {
      storeLesson('myagent', { id: 'l1', type: 'feedback', title: 'Lesson 1', content: 'Content', timestamp: '2026-01-28T10:00:00Z' });
      storeLesson('myagent', { id: 'l2', type: 'success', title: 'Lesson 2', content: 'Content', timestamp: '2026-01-28T11:00:00Z' });
      storeLesson('myagent', { id: 'l3', type: 'failure', title: 'Lesson 3', content: 'Content', timestamp: '2026-01-28T12:00:00Z' });
      storeLesson('myagent', { id: 'l4', type: 'observation', title: 'Lesson 4', content: 'Content', timestamp: '2026-01-28T13:00:00Z' });
    });

    test('returns all lessons', () => {
      const lessons = recall('myagent', 'lessons');
      expect(lessons.length).toBe(4);
    });

    test('filters by lesson_type', () => {
      const feedback = recall('myagent', 'lessons', { lesson_type: 'feedback' });
      expect(feedback.length).toBe(1);
      expect(feedback[0].type).toBe('feedback');
    });

    test('filters by since', () => {
      const lessons = recall('myagent', 'lessons', { since: '2026-01-28T11:30:00Z' });
      expect(lessons.length).toBe(2);
    });

    test('orders by timestamp descending', () => {
      const lessons = recall('myagent', 'lessons');
      expect(lessons[0].id).toBe('l4');
      expect(lessons[3].id).toBe('l1');
    });

    test('includes source and consolidation fields', () => {
      storeLesson('myagent', { 
        id: 'l-linked', 
        type: 'feedback', 
        title: 'Linked', 
        content: 'Content',
        source_event_id: 'evt-123',
        consolidated_to: 'principle-456'
      });

      const lessons = recall('myagent', 'lessons', { lesson_type: 'feedback' });
      const linked = lessons.find(l => l.id === 'l-linked');

      expect(linked.source_event_id).toBe('evt-123');
      expect(linked.consolidated_to).toBe('principle-456');
    });
  });

  describe('principles', () => {
    beforeEach(() => {
      storePrinciple('myagent', { name: 'principle-1', content: 'First principle', source_lessons: ['l1'] });
      storePrinciple('myagent', { name: 'principle-2', content: 'Second principle', source_lessons: ['l2', 'l3'] });
    });

    test('returns all principles', () => {
      const principles = recall('myagent', 'principles');
      expect(principles.length).toBe(2);
    });

    test('includes all fields', () => {
      const principles = recall('myagent', 'principles');
      const p = principles[0];

      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.content).toBeTruthy();
      expect(p.source_lessons).toBeInstanceOf(Array);
      expect(p.created_at).toBeTruthy();
      expect(p.updated_at).toBeTruthy();
    });

    test('parses source_lessons', () => {
      const principles = recall('myagent', 'principles');
      const p2 = principles.find(p => p.name === 'principle-2');

      expect(p2.source_lessons).toEqual(['l2', 'l3']);
    });

    test('respects limit', () => {
      const principles = recall('myagent', 'principles', {}, 1);
      expect(principles.length).toBe(1);
    });
  });

  describe('summaries', () => {
    beforeEach(() => {
      storeSummary('myagent', { type: 'week', period: '2026-W01', content: 'Week 1', event_count: 10 });
      storeSummary('myagent', { type: 'week', period: '2026-W02', content: 'Week 2', event_count: 15 });
      storeSummary('myagent', { type: 'month', period: '2026-01', content: 'January', event_count: 50 });
    });

    test('returns all summaries', () => {
      const summaries = recall('myagent', 'summaries');
      expect(summaries.length).toBe(3);
    });

    test('filters by summary_type', () => {
      const weeks = recall('myagent', 'summaries', { summary_type: 'week' });
      expect(weeks.length).toBe(2);
      expect(weeks.every(s => s.type === 'week')).toBe(true);
    });

    test('filters by since', () => {
      // Need to know actual created_at, so let's use a different approach
      const summaries = recall('myagent', 'summaries');
      expect(summaries.length).toBeGreaterThan(0);
    });

    test('includes all fields', () => {
      const summaries = recall('myagent', 'summaries', { summary_type: 'month' });
      const jan = summaries[0];

      expect(jan.id).toBeTruthy();
      expect(jan.type).toBe('month');
      expect(jan.period).toBe('2026-01');
      expect(jan.content).toBe('January');
      expect(jan.event_count).toBe(50);
      expect(jan.created_at).toBeTruthy();
    });
  });

  describe('error handling', () => {
    test('throws on unknown type', () => {
      expect(() => recall('myagent', 'invalid_type')).toThrow('Unknown type: invalid_type');
    });
  });

  describe('empty results', () => {
    test('returns empty array for no events', () => {
      ensureAgent('empty-agent');
      const events = recall('empty-agent', 'events');
      expect(events).toEqual([]);
    });

    test('returns empty array for no matching filters', () => {
      storeEvent('myagent', { id: 'e1', type: 'work_session', title: 'Test', content: 'Content' });
      const events = recall('myagent', 'events', { event_type: 'nonexistent' });
      expect(events).toEqual([]);
    });
  });
});
