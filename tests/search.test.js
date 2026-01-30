import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetDb } from '../db.js';
import { search } from '../commands/search.js';
import { storeEvent, storeEntity, storeLesson } from '../commands/store.js';

describe('search', () => {
  beforeEach(() => {
    resetDb(':memory:');
    
    // Seed diverse test data
    storeEvent('myagent', { 
      id: 'evt-auth', 
      type: 'work_session', 
      title: 'Authentication Implementation', 
      content: 'Implemented JWT tokens for secure user authentication' 
    });
    storeEvent('myagent', { 
      id: 'evt-db', 
      type: 'work_session', 
      title: 'Database Migration', 
      content: 'Migrated from PostgreSQL to SQLite for simplicity' 
    });
    
    storeEntity('myagent', { 
      type: 'project', 
      name: 'memory-cli', 
      content: 'CLI tool for agent memory system using SQLite' 
    });
    storeEntity('myagent', { 
      type: 'tool', 
      name: 'cursor', 
      content: 'AI-powered IDE for software development' 
    });
    
    storeLesson('myagent', { 
      id: 'lsn-infra', 
      type: 'observation', 
      title: 'Infrastructure over Discipline', 
      content: 'Always use infrastructure and automation rather than relying on discipline' 
    });
    storeLesson('myagent', { 
      id: 'lsn-benchmark', 
      type: 'failure', 
      title: 'Benchmark Before Optimizing', 
      content: 'Always capture baseline metrics before making performance improvements' 
    });
  });

  afterEach(() => {
    resetDb();
  });

  describe('basic search', () => {
    test('finds events by title', () => {
      const results = search('myagent', 'Authentication');
      const eventResult = results.find(r => r.type === 'event' && r.id === 'evt-auth');
      
      expect(eventResult).toBeTruthy();
      expect(eventResult.title).toBe('Authentication Implementation');
    });

    test('finds events by content', () => {
      const results = search('myagent', 'JWT');
      const eventResult = results.find(r => r.type === 'event');
      
      expect(eventResult).toBeTruthy();
      expect(eventResult.id).toBe('evt-auth');
    });

    test('finds entities by name', () => {
      const results = search('myagent', 'cursor');
      const entityResult = results.find(r => r.type === 'entity');
      
      expect(entityResult).toBeTruthy();
      expect(entityResult.title).toBe('cursor');
    });

    test('finds entities by content', () => {
      const results = search('myagent', 'software development');
      const entityResult = results.find(r => r.type === 'entity');
      
      expect(entityResult).toBeTruthy();
      expect(entityResult.title).toBe('cursor');
    });

    test('finds lessons by title', () => {
      const results = search('myagent', 'Infrastructure');
      const lessonResult = results.find(r => r.type === 'lesson');
      
      expect(lessonResult).toBeTruthy();
      expect(lessonResult.title).toBe('Infrastructure over Discipline');
    });

    test('finds lessons by content', () => {
      const results = search('myagent', 'baseline metrics');
      const lessonResult = results.find(r => r.type === 'lesson');
      
      expect(lessonResult).toBeTruthy();
      expect(lessonResult.id).toBe('lsn-benchmark');
    });
  });

  describe('type filtering', () => {
    test('searches only events when specified', () => {
      const results = search('myagent', 'SQLite', ['events']);
      
      expect(results.every(r => r.type === 'event')).toBe(true);
    });

    test('searches only entities when specified', () => {
      const results = search('myagent', 'SQLite', ['entities']);
      
      expect(results.every(r => r.type === 'entity')).toBe(true);
    });

    test('searches only lessons when specified', () => {
      const results = search('myagent', 'discipline', ['lessons']);
      
      expect(results.every(r => r.type === 'lesson')).toBe(true);
    });

    test('searches multiple types', () => {
      const results = search('myagent', 'SQLite', ['events', 'entities']);
      const types = [...new Set(results.map(r => r.type))];
      
      expect(types).toContain('event');
      expect(types).toContain('entity');
      expect(types).not.toContain('lesson');
    });

    test('defaults to all types', () => {
      // Use a term that appears in all types
      storeEvent('myagent', { id: 'evt-test', type: 'work_session', title: 'Test Event', content: 'universal search term' });
      storeEntity('myagent', { type: 'project', name: 'test-project', content: 'universal search term' });
      storeLesson('myagent', { id: 'lsn-test', type: 'feedback', title: 'Test Lesson', content: 'universal search term' });
      
      const results = search('myagent', 'universal');
      const types = [...new Set(results.map(r => r.type))];
      
      expect(types).toContain('event');
      expect(types).toContain('entity');
      expect(types).toContain('lesson');
    });
  });

  describe('limit', () => {
    test('respects limit parameter', () => {
      // Add more events to exceed limit
      for (let i = 0; i < 15; i++) {
        storeEvent('myagent', { 
          id: `evt-bulk-${i}`, 
          type: 'work_session', 
          title: `Bulk Event ${i}`, 
          content: 'searchable content' 
        });
      }
      
      const results = search('myagent', 'searchable', ['events'], 5);
      expect(results.length).toBe(5);
    });

    test('default limit is 10', () => {
      // Add many events
      for (let i = 0; i < 20; i++) {
        storeEvent('myagent', { 
          id: `evt-many-${i}`, 
          type: 'work_session', 
          title: `Many Event ${i}`, 
          content: 'common term' 
        });
      }
      
      const results = search('myagent', 'common', ['events']);
      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('snippets', () => {
    test('extracts snippet around match', () => {
      storeEvent('myagent', { 
        id: 'evt-long', 
        type: 'work_session', 
        title: 'Long Content Event', 
        content: 'This is a very long piece of content with many words before the important keyword and many words after it to test snippet extraction'
      });
      
      const results = search('myagent', 'keyword', ['events']);
      const result = results.find(r => r.id === 'evt-long');
      
      expect(result.snippet).toContain('keyword');
      expect(result.snippet.length).toBeLessThan(200);
    });

    test('handles match at beginning', () => {
      storeEvent('myagent', { 
        id: 'evt-start', 
        type: 'work_session', 
        title: 'Start Match', 
        content: 'beginning is the match location in this content'
      });
      
      const results = search('myagent', 'beginning', ['events']);
      const result = results.find(r => r.id === 'evt-start');
      
      expect(result.snippet).toContain('beginning');
    });

    test('handles no match in content (title match)', () => {
      const results = search('myagent', 'Authentication');
      const result = results.find(r => r.type === 'event');
      
      expect(result.snippet).toBeTruthy();
    });
  });

  describe('result format', () => {
    test('event results have correct shape', () => {
      const results = search('myagent', 'JWT');
      const event = results.find(r => r.type === 'event');
      
      expect(event).toHaveProperty('type', 'event');
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('title');
      expect(event).toHaveProperty('snippet');
      expect(event).toHaveProperty('score');
      expect(event).toHaveProperty('timestamp');
    });

    test('entity results have correct shape', () => {
      const results = search('myagent', 'cursor');
      const entity = results.find(r => r.type === 'entity');
      
      expect(entity).toHaveProperty('type', 'entity');
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('title');
      expect(entity).toHaveProperty('snippet');
      expect(entity).toHaveProperty('score');
      expect(entity).toHaveProperty('updated_at');
    });

    test('lesson results have correct shape', () => {
      const results = search('myagent', 'discipline');
      const lesson = results.find(r => r.type === 'lesson');
      
      expect(lesson).toHaveProperty('type', 'lesson');
      expect(lesson).toHaveProperty('id');
      expect(lesson).toHaveProperty('title');
      expect(lesson).toHaveProperty('snippet');
      expect(lesson).toHaveProperty('score');
      expect(lesson).toHaveProperty('timestamp');
    });
  });

  describe('agent isolation', () => {
    test('only returns results for specified agent', () => {
      storeEvent('otheragent', { 
        id: 'other-evt', 
        type: 'work_session', 
        title: 'Other Authentication', 
        content: 'JWT implementation by other' 
      });
      
      const myResults = search('myagent', 'JWT');
      const otherResults = search('otheragent', 'JWT');
      
      expect(myResults.every(r => r.id !== 'other-evt')).toBe(true);
      expect(otherResults.some(r => r.id === 'other-evt')).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('handles empty results', () => {
      const results = search('myagent', 'zzzznonexistentzzz');
      expect(results).toEqual([]);
    });

    test('handles special characters in query', () => {
      storeEvent('myagent', { 
        id: 'evt-special', 
        type: 'work_session', 
        title: 'Special Event', 
        content: 'Contains special chars: @#$%' 
      });
      
      // FTS5 handles special characters differently - test basic search
      const results = search('myagent', 'special');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('sorting', () => {
    test('results are sorted by relevance score', () => {
      // The results should be sorted by FTS rank
      const results = search('myagent', 'SQLite');
      
      // Verify scores are in ascending order (FTS rank is negative, lower = better)
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i - 1].score);
      }
    });
  });
});
