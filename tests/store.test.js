import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetDb, getDb } from '../db.js';
import { 
  storeEvent, 
  storeEntity, 
  storeLesson, 
  storePrinciple, 
  storeSummary 
} from '../commands/store.js';

describe('store', () => {
  beforeEach(() => {
    resetDb(':memory:');
  });

  afterEach(() => {
    resetDb();
  });

  describe('storeEvent', () => {
    test('creates event with auto-generated id', () => {
      const result = storeEvent('myagent', {
        type: 'work_session',
        title: 'Test Session',
        content: 'Did some work'
      });

      expect(result.id).toMatch(/^\d{4}-\d{2}-\d{2}-\d{3}$/);
      expect(result.timestamp).toBeTruthy();
    });

    test('uses provided id', () => {
      const result = storeEvent('myagent', {
        id: 'custom-id-001',
        type: 'work_session',
        title: 'Test',
        content: 'Content'
      });

      expect(result.id).toBe('custom-id-001');
    });

    test('uses provided timestamp', () => {
      const timestamp = '2026-01-15T10:00:00.000Z';
      const result = storeEvent('myagent', {
        type: 'work_session',
        title: 'Test',
        content: 'Content',
        timestamp
      });

      expect(result.timestamp).toBe(timestamp);
    });

    test('stores event in database', () => {
      storeEvent('myagent', {
        id: 'evt-1',
        type: 'decision',
        title: 'Chose TypeScript',
        content: 'Decided to use TypeScript for the project'
      });

      const db = getDb();
      const event = db.query('SELECT * FROM events WHERE id = ?').get('evt-1');

      expect(event.agent_id).toBe('myagent');
      expect(event.type).toBe('decision');
      expect(event.title).toBe('Chose TypeScript');
      expect(event.content).toBe('Decided to use TypeScript for the project');
      expect(event.tier).toBe('hot');
    });

    test('stores metadata as JSON', () => {
      storeEvent('myagent', {
        id: 'evt-meta',
        type: 'work_session',
        title: 'With Meta',
        content: 'Content',
        metadata: { tags: ['testing', 'memory'], priority: 1 }
      });

      const db = getDb();
      const event = db.query('SELECT metadata FROM events WHERE id = ?').get('evt-meta');
      const metadata = JSON.parse(event.metadata);

      expect(metadata.tags).toEqual(['testing', 'memory']);
      expect(metadata.priority).toBe(1);
    });

    test('updates existing event', () => {
      storeEvent('myagent', {
        id: 'evt-update',
        type: 'work_session',
        title: 'Original Title',
        content: 'Original content'
      });

      storeEvent('myagent', {
        id: 'evt-update',
        type: 'work_session',
        title: 'Updated Title',
        content: 'Updated content'
      });

      const db = getDb();
      const events = db.query('SELECT * FROM events WHERE id = ?').all('evt-update');
      
      expect(events.length).toBe(1);
      expect(events[0].title).toBe('Updated Title');
      expect(events[0].content).toBe('Updated content');
    });

    test('populates FTS index on insert', () => {
      storeEvent('myagent', {
        id: 'evt-fts',
        type: 'work_session',
        title: 'Authentication System',
        content: 'Implemented JWT tokens for user authentication'
      });

      const db = getDb();
      const results = db.query(`
        SELECT * FROM events_fts WHERE events_fts MATCH 'JWT'
      `).all();

      expect(results.length).toBe(1);
    });

    test('updates FTS index on update', () => {
      storeEvent('myagent', {
        id: 'evt-fts-update',
        type: 'work_session',
        title: 'Original',
        content: 'Original search term'
      });

      storeEvent('myagent', {
        id: 'evt-fts-update',
        type: 'work_session',
        title: 'Updated',
        content: 'New unique searchable term'
      });

      const db = getDb();
      const oldResults = db.query(`
        SELECT * FROM events_fts WHERE events_fts MATCH 'Original'
      `).all();
      const newResults = db.query(`
        SELECT * FROM events_fts WHERE events_fts MATCH 'unique'
      `).all();

      expect(oldResults.length).toBe(0);
      expect(newResults.length).toBe(1);
    });

    test('increments sequence number for same day', () => {
      const r1 = storeEvent('myagent', { type: 'work_session', title: 'First', content: 'c' });
      const r2 = storeEvent('myagent', { type: 'work_session', title: 'Second', content: 'c' });
      const r3 = storeEvent('myagent', { type: 'work_session', title: 'Third', content: 'c' });

      // IDs should be sequential: YYYY-MM-DD-001, YYYY-MM-DD-002, YYYY-MM-DD-003
      const seq1 = parseInt(r1.id.split('-').pop());
      const seq2 = parseInt(r2.id.split('-').pop());
      const seq3 = parseInt(r3.id.split('-').pop());

      expect(seq2).toBe(seq1 + 1);
      expect(seq3).toBe(seq2 + 1);
    });
  });

  describe('storeEntity', () => {
    test('creates entity with auto-generated id', () => {
      const result = storeEntity('myagent', {
        type: 'project',
        name: 'memory-cli',
        content: '# Memory CLI\nCLI for agent memory'
      });

      expect(result.id).toBe('myagent/projects/memory-cli');
      expect(result.updated_at).toBeTruthy();
    });

    test('stores entity in database', () => {
      storeEntity('myagent', {
        type: 'person',
        name: 'alice',
        content: '# Alice\nTeam member'
      });

      const db = getDb();
      const entity = db.query('SELECT * FROM entities WHERE name = ?').get('alice');

      expect(entity.agent_id).toBe('myagent');
      expect(entity.type).toBe('person');
      expect(entity.content).toBe('# Alice\nTeam member');
    });

    test('updates existing entity', () => {
      storeEntity('myagent', {
        type: 'tool',
        name: 'cursor',
        content: 'Original description'
      });

      storeEntity('myagent', {
        type: 'tool',
        name: 'cursor',
        content: 'Updated description'
      });

      const db = getDb();
      const entities = db.query('SELECT * FROM entities WHERE name = ?').all('cursor');

      expect(entities.length).toBe(1);
      expect(entities[0].content).toBe('Updated description');
    });

    test('populates FTS index', () => {
      storeEntity('myagent', {
        type: 'project',
        name: 'marketplace',
        content: 'Automotive parts marketplace platform'
      });

      const db = getDb();
      const results = db.query(`
        SELECT * FROM entities_fts WHERE entities_fts MATCH 'marketplace'
      `).all();

      expect(results.length).toBe(1);
    });

    test('isolates entities by agent', () => {
      storeEntity('agent1', { type: 'project', name: 'shared', content: 'Agent1 version' });
      storeEntity('agent2', { type: 'project', name: 'shared', content: 'Agent2 version' });

      const db = getDb();
      const entities = db.query('SELECT * FROM entities WHERE name = ?').all('shared');

      expect(entities.length).toBe(2);
      expect(entities.find(e => e.agent_id === 'agent1').content).toBe('Agent1 version');
      expect(entities.find(e => e.agent_id === 'agent2').content).toBe('Agent2 version');
    });
  });

  describe('storeLesson', () => {
    test('creates lesson with auto-generated id', () => {
      const result = storeLesson('myagent', {
        type: 'feedback',
        title: 'Test Lesson',
        content: 'Learned something'
      });

      expect(result.id).toMatch(/^\d{4}-\d{2}-\d{2}-\d{3}$/);
      expect(result.timestamp).toBeTruthy();
    });

    test('stores lesson types correctly', () => {
      const types = ['feedback', 'success', 'failure', 'observation'];

      for (const type of types) {
        storeLesson('myagent', {
          id: `lesson-${type}`,
          type,
          title: `${type} lesson`,
          content: 'Content'
        });
      }

      const db = getDb();
      for (const type of types) {
        const lesson = db.query('SELECT type FROM lessons WHERE id = ?').get(`lesson-${type}`);
        expect(lesson.type).toBe(type);
      }
    });

    test('stores source_event_id', () => {
      storeLesson('myagent', {
        id: 'lesson-with-source',
        type: 'feedback',
        title: 'Linked Lesson',
        content: 'Content',
        source_event_id: 'evt-123'
      });

      const db = getDb();
      const lesson = db.query('SELECT source_event_id FROM lessons WHERE id = ?').get('lesson-with-source');

      expect(lesson.source_event_id).toBe('evt-123');
    });

    test('stores consolidated_to', () => {
      storeLesson('myagent', {
        id: 'lesson-consolidated',
        type: 'feedback',
        title: 'Consolidated Lesson',
        content: 'Content',
        consolidated_to: 'principle-123'
      });

      const db = getDb();
      const lesson = db.query('SELECT consolidated_to FROM lessons WHERE id = ?').get('lesson-consolidated');

      expect(lesson.consolidated_to).toBe('principle-123');
    });

    test('updates existing lesson', () => {
      storeLesson('myagent', {
        id: 'lesson-update',
        type: 'feedback',
        title: 'Original',
        content: 'Original'
      });

      storeLesson('myagent', {
        id: 'lesson-update',
        type: 'success',
        title: 'Updated',
        content: 'Updated'
      });

      const db = getDb();
      const lessons = db.query('SELECT * FROM lessons WHERE id = ?').all('lesson-update');

      expect(lessons.length).toBe(1);
      expect(lessons[0].type).toBe('success');
      expect(lessons[0].title).toBe('Updated');
    });

    test('populates FTS index', () => {
      storeLesson('myagent', {
        id: 'lesson-fts',
        type: 'observation',
        title: 'Infrastructure Insight',
        content: 'Always use infrastructure over discipline for critical behaviors'
      });

      const db = getDb();
      const results = db.query(`
        SELECT * FROM lessons_fts WHERE lessons_fts MATCH 'infrastructure'
      `).all();

      expect(results.length).toBe(1);
    });
  });

  describe('storePrinciple', () => {
    test('creates principle with auto-generated id', () => {
      const result = storePrinciple('myagent', {
        name: 'test-principle',
        content: '## Principle\nAlways test your code'
      });

      expect(result.id).toBe('myagent/test-principle');
      expect(result.updated_at).toBeTruthy();
    });

    test('stores source_lessons', () => {
      storePrinciple('myagent', {
        name: 'testing-principle',
        content: 'Content',
        source_lessons: ['lesson-1', 'lesson-2', 'lesson-3']
      });

      const db = getDb();
      const principle = db.query('SELECT source_lessons FROM principles WHERE name = ?').get('testing-principle');
      const sources = JSON.parse(principle.source_lessons);

      expect(sources).toEqual(['lesson-1', 'lesson-2', 'lesson-3']);
    });

    test('updates existing principle', () => {
      storePrinciple('myagent', {
        name: 'evolving-principle',
        content: 'Version 1'
      });

      storePrinciple('myagent', {
        name: 'evolving-principle',
        content: 'Version 2',
        source_lessons: ['new-lesson']
      });

      const db = getDb();
      const principles = db.query('SELECT * FROM principles WHERE name = ?').all('evolving-principle');

      expect(principles.length).toBe(1);
      expect(principles[0].content).toBe('Version 2');
    });
  });

  describe('storeSummary', () => {
    test('creates summary', () => {
      const result = storeSummary('myagent', {
        type: 'week',
        period: '2026-W04',
        content: '## Week Summary\nDid stuff',
        event_count: 15
      });

      expect(result.id).toBe('myagent/weeks/2026-W04');
      expect(result.created_at).toBeTruthy();
    });

    test('stores summary data', () => {
      storeSummary('myagent', {
        type: 'week',
        period: '2026-W05',
        content: 'Summary content',
        event_count: 20
      });

      const db = getDb();
      const summary = db.query('SELECT * FROM summaries WHERE period = ?').get('2026-W05');

      expect(summary.type).toBe('week');
      expect(summary.content).toBe('Summary content');
      expect(summary.event_count).toBe(20);
    });

    test('upserts on conflict', () => {
      storeSummary('myagent', {
        type: 'week',
        period: '2026-W06',
        content: 'First version',
        event_count: 10
      });

      storeSummary('myagent', {
        type: 'week',
        period: '2026-W06',
        content: 'Updated version',
        event_count: 12
      });

      const db = getDb();
      const summaries = db.query('SELECT * FROM summaries WHERE period = ?').all('2026-W06');

      expect(summaries.length).toBe(1);
      expect(summaries[0].content).toBe('Updated version');
      expect(summaries[0].event_count).toBe(12);
    });

    test('supports month summaries', () => {
      storeSummary('myagent', {
        type: 'month',
        period: '2026-01',
        content: 'January summary',
        event_count: 50
      });

      const db = getDb();
      const summary = db.query('SELECT * FROM summaries WHERE type = ?').get('month');

      expect(summary.period).toBe('2026-01');
    });
  });
});
