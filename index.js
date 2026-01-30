#!/usr/bin/env bun

import { parseArgs } from 'util';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    user: { type: 'string', short: 'u' },
    type: { type: 'string', short: 't' },
    filters: { type: 'string' },
    limit: { type: 'string', short: 'l' },
    query: { type: 'string', short: 'q' },
    types: { type: 'string' },
    since: { type: 'string' },
    target: { type: 'string' },
    action: { type: 'string' },
    period: { type: 'string' },
    lessonIds: { type: 'string' },
    principleName: { type: 'string' },
    help: { type: 'boolean', short: 'h' }
  },
  allowPositionals: true
});

const command = positionals[0];

// Allow help without user parameter
if (command !== 'help' && command !== '--help' && command !== '-h' && !values.help) {
  if (!values.user) {
    console.error('Error: --user parameter is required');
    console.error('Usage: agentmem <command> --user=<user_id> [options]');
    process.exit(1);
  }
}

// Parse limit as number
if (values.limit) {
  values.limit = parseInt(values.limit, 10);
}

// NO updateTiers() on startup - only on store operations

try {
  let result;
  
  switch (command) {
    case 'session': {
      const { getSession } = await import('./commands/session.js');
      result = getSession(values.user);
      break;
    }
      
    case 'state': {
      const stateCmd = await import('./commands/state.js');
      if (positionals[1]) {
        const content = positionals.slice(1).join(' ');
        result = stateCmd.setState(values.user, content);
      } else {
        result = stateCmd.getState(values.user);
      }
      break;
    }
      
    case 'store': {
      // Only update tiers on store operations
      const { updateTiers } = await import('./db.js');
      updateTiers();
      
      const storeCmd = await import('./commands/store.js');
      
      // Accept JSON from positional arg OR stdin
      let jsonInput = positionals[1];
      if (!jsonInput && !process.stdin.isTTY) {
        // Read from stdin
        jsonInput = await Bun.stdin.text();
        jsonInput = jsonInput.trim();
      }
      
      if (!values.type || !jsonInput) {
        throw new Error('Usage: agentmem store --user=<user> --type=<type> <json_data>\n       echo \'{"json":"data"}\' | agentmem store --user=<user> --type=<type>');
      }
      const data = JSON.parse(jsonInput);
      switch (values.type) {
        case 'event':
          result = storeCmd.storeEvent(values.user, data);
          break;
        case 'entity':
          result = storeCmd.storeEntity(values.user, data);
          break;
        case 'lesson':
          result = storeCmd.storeLesson(values.user, data);
          break;
        case 'principle':
          result = storeCmd.storePrinciple(values.user, data);
          break;
        case 'summary':
          result = storeCmd.storeSummary(values.user, data);
          break;
        default:
          throw new Error(`Unknown store type: ${values.type}`);
      }
      break;
    }
      
    case 'recall': {
      const { recall } = await import('./commands/recall.js');
      if (!values.type) {
        throw new Error('Usage: agentmem recall --user=<user> --type=<type> [--filters=<json>] [--limit=<n>]');
      }
      const filters = values.filters ? JSON.parse(values.filters) : {};
      result = recall(values.user, values.type, filters, values.limit);
      break;
    }
      
    case 'search': {
      const { search } = await import('./commands/search.js');
      if (!values.query) {
        throw new Error('Usage: agentmem search --user=<user> --query="<query>" [--types=<comma-separated>] [--limit=<n>]');
      }
      const types = values.types ? values.types.split(',') : ['events', 'entities', 'lessons'];
      result = search(values.user, values.query, types, values.limit);
      break;
    }
      
    case 'export': {
      const { exportMemory } = await import('./commands/export.js');
      if (!values.target) {
        throw new Error('Usage: agentmem export --user=<user> --target=<dir> [--types=<comma-separated>] [--since=<iso-date>]');
      }
      const exportTypes = values.types ? values.types.split(',') : undefined;
      result = exportMemory(values.user, values.target, {
        types: exportTypes,
        since: values.since
      });
      break;
    }
      
    case 'rollup': {
      if (!values.action) {
        throw new Error('Usage: agentmem rollup --user=<user> --action=<action> [--period=<period>] [--lessonIds=<comma-separated>] [--principleName=<name>]');
      }
      result = { message: 'Rollup not yet implemented' };
      break;
    }
      
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      process.exit(0);
      
    default:
      printHelp();
      process.exit(1);
  }
  
  console.log(JSON.stringify(result, null, 2));
  
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`
agentmem - Memory system for AI agents

Usage:
  agentmem <command> --user=<user_id> [options]

Commands:
  session                      Get full session context (state, hot events, principles, summary, lessons)
  state [content]              Get or set agent state
  store --type=<type> <json>   Store memory (event, entity, lesson, principle, summary)
  recall --type=<type>         Recall memories with filters
  search --query="<query>"     Full-text search
  export --target=<dir>        Export to markdown files
  rollup --action=<action>     Generate summaries or consolidate lessons

Options:
  -u, --user <id>             Agent/user ID (required)
  -t, --type <type>           Memory type (events, entities, lessons, etc.)
  -f, --filters <json>        Filter criteria as JSON
  -l, --limit <n>             Limit results (default: 20)
  -q, --query <query>         Search query
  --types <list>              Comma-separated types for search/export
  --since <iso-date>          Filter by date
  --target <dir>              Export target directory
  --action <action>           Rollup action (weekly_summary, consolidate_lessons)
  --period <period>           Period for rollup (e.g., 2026-W04)
  --lessonIds <list>          Comma-separated lesson IDs
  --principleName <name>      Principle name for consolidation

Examples:
  agentmem session --user=myagent
  agentmem state --user=myagent
  agentmem state --user=myagent "## Focus\\nWorking on..."
  agentmem store --user=myagent --type=event '{"type":"work_session","title":"Did X","content":"..."}'
  agentmem recall --user=myagent --type=events --filters='{"tier":"hot"}' --limit=10
  agentmem search --user=myagent --query="authentication" --types=events,entities
  agentmem export --user=myagent --target=./export --types=events,entities --since=2026-01-01T00:00:00Z

Environment:
  AGENTMEM_DB_PATH    Custom database path (default: ~/.agentmem/memory.db)
`);
}
