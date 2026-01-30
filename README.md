# agentmem

CLI memory system for AI agents. Built on SQLite with FTS5 full-text search.

## Features

- **Multi-agent support** — Each agent has isolated memory via `--user`
- **Event tiers** — Automatic hot/warm/cold classification based on age
- **Full-text search** — FTS5-powered search across events, entities, and lessons
- **Session bootstrap** — Single command returns all context needed to start a session
- **Zero dependencies** — Uses Bun's native SQLite, no npm packages required

## Installation

Requires [Bun](https://bun.sh) v1.0+.

```bash
# Clone and use directly
git clone https://github.com/SilasReinagel/agentmem.git
cd agentmem
bun index.js session --user=myagent

# Or install globally
bun install -g agentmem
agentmem session --user=myagent
```

## Quick Start

```bash
# Start a session (returns state, hot events, principles, recent lessons)
agentmem session --user=myagent

# Store an event
agentmem store --user=myagent --type=event '{"type":"work_session","title":"Built feature X","content":"Implemented the new dashboard..."}'

# Store a lesson learned
agentmem store --user=myagent --type=lesson '{"type":"observation","title":"Always test edge cases","content":"Found a bug because..."}'

# Search memories
agentmem search --user=myagent --query="dashboard"

# Get/set agent state
agentmem state --user=myagent "## Current Focus\nWorking on dashboard"
agentmem state --user=myagent
```

## Commands

### `session`

Get everything needed to start a session in one call.

```bash
agentmem session --user=myagent
```

Returns:
- Current state
- Hot events (last 72 hours, max 20)
- All principles
- Most recent summary
- Recent unconsolidated lessons (max 10)

### `state`

Get or set the agent's current state (scratchpad).

```bash
# Get state
agentmem state --user=myagent

# Set state
agentmem state --user=myagent "## Focus\nBuilding memory system"
```

### `store`

Store new memories. Supports: `event`, `entity`, `lesson`, `principle`, `summary`.

```bash
# Store event
agentmem store --user=myagent --type=event '{"type":"work_session","title":"Title","content":"Details..."}'

# Store entity (project, person, tool, etc.)
agentmem store --user=myagent --type=entity '{"type":"project","name":"myproject","content":"Description..."}'

# Store lesson
agentmem store --user=myagent --type=lesson '{"type":"feedback","title":"Lesson title","content":"What was learned..."}'

# Store principle (consolidated from lessons)
agentmem store --user=myagent --type=principle '{"name":"principle-name","content":"The principle...","source_lessons":["lesson-id-1"]}'

# Pipe from stdin
echo '{"type":"work_session","title":"Test","content":"..."}' | agentmem store --user=myagent --type=event
```

### `recall`

Recall memories with filters.

```bash
# Get hot events
agentmem recall --user=myagent --type=events --filters='{"tier":"hot"}'

# Get events by type
agentmem recall --user=myagent --type=events --filters='{"event_type":"decision"}'

# Get events since date
agentmem recall --user=myagent --type=events --filters='{"since":"2026-01-01T00:00:00Z"}'

# Get entities by type
agentmem recall --user=myagent --type=entities --filters='{"entity_type":"project"}'

# Get all principles
agentmem recall --user=myagent --type=principles
```

### `search`

Full-text search across memories.

```bash
# Search all types
agentmem search --user=myagent --query="authentication"

# Search specific types
agentmem search --user=myagent --query="authentication" --types=events,lessons

# Limit results
agentmem search --user=myagent --query="authentication" --limit=5
```

### `export`

Export memories to markdown files.

```bash
# Export all
agentmem export --user=myagent --target=./backup

# Export specific types
agentmem export --user=myagent --target=./backup --types=events,lessons

# Export since date
agentmem export --user=myagent --target=./backup --since=2026-01-01T00:00:00Z
```

## Data Model

### Events

Time-based memories with automatic tier classification:
- **hot** — Last 72 hours
- **warm** — 72 hours to 30 days
- **cold** — Older than 30 days

```json
{
  "type": "work_session|decision|discovery|error|...",
  "title": "Short description",
  "content": "Full details",
  "metadata": { "tags": ["optional"] }
}
```

### Entities

Reference information about projects, people, tools, etc.

```json
{
  "type": "project|person|tool|concept|...",
  "name": "unique-name",
  "content": "Description and details"
}
```

### Lessons

Learnings that can be consolidated into principles.

```json
{
  "type": "feedback|success|failure|observation",
  "title": "What was learned",
  "content": "Details and context",
  "source_event_id": "optional-event-reference"
}
```

### Principles

Consolidated wisdom from multiple lessons.

```json
{
  "name": "principle-name",
  "content": "The distilled principle",
  "source_lessons": ["lesson-1", "lesson-2"]
}
```

## Agent Integration

The CLI handles storage and retrieval. Semantic operations (summarization, consolidation) belong in the calling agent. Here are the patterns:

### Weekly Summary

Compress a week's events into a narrative summary.

```bash
# 1. Recall events for the period
agentmem recall --user=myagent --type=events \
  --filters='{"since":"2026-01-20T00:00:00Z","until":"2026-01-27T00:00:00Z"}' \
  --limit=100

# 2. Agent synthesizes summary using LLM (your responsibility)
# Input: the events JSON
# Output: narrative summary + event count

# 3. Store the summary
agentmem store --user=myagent --type=summary '{
  "type": "week",
  "period": "2026-W04",
  "content": "## Week 4 Summary\n\nFocused on authentication system...",
  "event_count": 23
}'
```

### Lesson → Principle Consolidation

When patterns emerge across multiple lessons, consolidate into a principle.

```bash
# 1. Recall unconsolidated lessons
agentmem recall --user=myagent --type=lessons --limit=50
# Filter for consolidated_to: null in the results

# 2. Agent identifies patterns and synthesizes principle (your responsibility)
# Input: lessons with similar themes
# Output: distilled principle

# 3. Store the principle with source references
agentmem store --user=myagent --type=principle '{
  "name": "infrastructure-over-discipline",
  "content": "When a behavior must happen reliably, encode it in infrastructure (automation, constraints, defaults) rather than relying on human discipline. Discipline fails under stress; infrastructure persists.",
  "source_lessons": ["2026-01-15-003", "2026-01-18-007", "2026-01-22-001"]
}'

# 4. Mark source lessons as consolidated (update each)
agentmem store --user=myagent --type=lesson '{
  "id": "2026-01-15-003",
  "type": "observation",
  "title": "Original title",
  "content": "Original content",
  "consolidated_to": "myagent/infrastructure-over-discipline"
}'
```

### Session Lifecycle

Recommended flow for an agent session:

```bash
# 1. Session start: get all context in one call
agentmem session --user=myagent
# Returns: state, hot_events, principles, recent_summary, recent_lessons

# 2. During session: store events as they happen
agentmem store --user=myagent --type=event '{"type":"work_session",...}'

# 3. End of session: update state, store lessons learned
agentmem state --user=myagent "## Current Focus\nUpdated focus..."
agentmem store --user=myagent --type=lesson '{"type":"observation",...}'

# 4. Periodic maintenance (weekly): run summary consolidation
# See "Weekly Summary" pattern above
```

### Tier Management

Event tiers update automatically when you call `store`. The thresholds:
- **hot**: < 72 hours old
- **warm**: 72 hours to 30 days
- **cold**: > 30 days

No manual intervention needed. Query by tier using:

```bash
agentmem recall --user=myagent --type=events --filters='{"tier":"hot"}'
agentmem recall --user=myagent --type=events --filters='{"tier":"warm"}' --limit=50
```

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `AGENTMEM_DB_PATH` | Custom database path | `~/.agentmem/memory.db` |

## Development

```bash
# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Run with coverage
bun test --coverage
```

## Architecture

- **Database**: SQLite with WAL mode and FTS5 indexes
- **Location**: `~/.agentmem/memory.db` by default
- **Runtime**: Bun (uses native `bun:sqlite`)

## License

MIT
