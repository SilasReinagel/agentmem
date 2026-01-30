import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetDb } from '../db.js';
import { getState, setState } from '../commands/state.js';

describe('state', () => {
  beforeEach(() => {
    resetDb(':memory:');
  });

  afterEach(() => {
    resetDb();
  });

  describe('getState', () => {
    test('returns empty state for new agent', () => {
      const state = getState('new-agent');
      
      expect(state.content).toBe('');
      expect(state.updated_at).toBeNull();
    });

    test('returns stored state', () => {
      setState('myagent', '## Focus\nWorking on tests');
      const state = getState('myagent');
      
      expect(state.content).toBe('## Focus\nWorking on tests');
      expect(state.updated_at).toBeTruthy();
    });

    test('isolates state by agent', () => {
      setState('agent1', 'Agent1 state');
      setState('agent2', 'Agent2 state');
      
      expect(getState('agent1').content).toBe('Agent1 state');
      expect(getState('agent2').content).toBe('Agent2 state');
    });
  });

  describe('setState', () => {
    test('creates new state', () => {
      const result = setState('agent', 'Initial state');
      
      expect(result.updated_at).toBeTruthy();
      expect(getState('agent').content).toBe('Initial state');
    });

    test('overwrites existing state', () => {
      setState('agent', 'First');
      setState('agent', 'Second');
      
      expect(getState('agent').content).toBe('Second');
    });

    test('updates timestamp on change', async () => {
      const result1 = setState('agent', 'First');
      
      // Small delay to ensure different timestamp
      await new Promise(r => setTimeout(r, 10));
      
      const result2 = setState('agent', 'Second');
      
      expect(result2.updated_at).not.toBe(result1.updated_at);
    });

    test('handles markdown content', () => {
      const markdown = `## Current Focus
Building memory CLI tests

## Blockers
- None

## Open Questions
1. Coverage target?
2. CI integration?`;

      setState('agent', markdown);
      expect(getState('agent').content).toBe(markdown);
    });

    test('handles unicode content', () => {
      setState('agent', '## Focus\n🚀 Launching feature\n日本語テスト');
      expect(getState('agent').content).toBe('## Focus\n🚀 Launching feature\n日本語テスト');
    });

    test('handles empty content', () => {
      setState('agent', '');
      expect(getState('agent').content).toBe('');
    });
  });
});
