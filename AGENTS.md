# AGENTS.md

## Agent skills

### Issue tracker

Issues live as GitHub issues in this repo (`gh` CLI); see `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix); see `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/` at repo root); see `docs/agents/domain.md`.

### Git Commits

Use `/ce-commit` skill to create a git commit with a clear, value-communication message.

## Workspace folders

### `.scratch/`

Temporary space for ad-hoc operations (downloads, intermediate payloads, one-off notes).
Gitignored except for `.gitkeep` — nothing placed here is tracked or expected to survive
across sessions. Safe to write to freely; safe to delete contents at any time.

### `.firecrawl/`

Output space for the firecrawl agent (fetched pages, extracted content). Gitignored
except for `.gitkeep` — nothing placed here is tracked or expected to survive across
sessions.

### `handoff/`

Durable, tracked artifacts. When an agent finishes work in a git worktree, it writes an
implementation report and findings here before the worktree is torn down, so the work is
not lost. Unlike `.scratch/` and `.firecrawl/`, files in `handoff/` are committed.
