# Issue tracker: Azure DevOps

Issues and Specs for this repository live as Azure DevOps work items. Use the Azure CLI's `azure-devops` extension (`boards` / `repos` command groups) for all operations.

## Coordinates for this repository

| Thing            | Value                             |
| ---------------- | --------------------------------- |
| Organization     | `https://dev.azure.com/{org}`     |
| Project          | `{project-name}`                  |
| Repository       | `{repository-name}`               |
| Repo scope tag   | `{project-name}`                  |
| Default assignee | `{user-email}`                    |
| CLI command      | **`az-cli` only.** Never `az`.    |

**The CLI is invoked as `az-cli`, in PowerShell.** It resolves to `~\.local\bin\az-cli.ps1`. Do not substitute bare `az` - that is a deliberate repository convention, not a fallback. Note that `command -v az-cli` from a Bash shell will *not* find it (Bash doesn't resolve `.ps1`); check with `Get-Command az-cli` in PowerShell instead.

**Two invariants that every command in this file obeys:**

1. **Every work item carries the tag `{project-name}`.** `{project-name}` is a multi-repository project - work items belong to the project, not the repository - so this tag is the only thing scoping a query to this repository. Tag writes *replace* the whole set, so it must be re-sent on every tag update.
2. **Every query filters on that tag.** `AND [System.Tags] CONTAINS '{project-name}'`. Without it, a query returns the whole project's items.

## Setup

```powershell
# Install extension if not present
az-cli extension add --name azure-devops

# Authenticate
az-cli devops login --organization https://dev.azure.com/{org}
```

**Do not set machine-level defaults.** `az-cli devops configure --defaults organization=... project=...` looks like a convenience but is a footgun: any pre-existing default silently redirects writes to another project, and the failure is invisible - the command succeeds and the work item appears somewhere else. Pass `--org` explicitly on every command, and `--project` on the two commands that accept it (see below).

## Conventions

- Use PowerShell variables for work item title/description/comment to avoid quoting issues and command line length limits.
- Work item types depend on the project's process template - **Basic** template: `Issue` (features/Specs), `Task` (implementation sub-tasks); **Agile** template: `User Story`, `Bug`, `Task`. Confirm which template `{project-name}` uses before assuming; the examples below use the Basic names.
- Triage state is tracked via **Tags** (see `triage-labels.md` for the role strings).
- Comments append to the work item's discussion thread via `--discussion`.

**Create a work item** (feature / PRD):

```powershell
az-cli boards work-item create --title $title --type "Issue" `
  --description $description `
  --assigned-to {user-email} `
  --fields "Tags={project-name}" `
  --org https://dev.azure.com/{org} --project {project-name}
```

**Create a task** (implementation sub-task): same command with `--type "Task"`.

**Exception - omit `--assigned-to` for wayfinder tickets.** The default assignee applies to Issues, Specs, and triage-queue items. `/wayfinder` uses `System.AssignedTo` as the *claim* signal, so a wayfinder map or child ticket created pre-assigned is born claimed and drops out of the frontier query. See "Wayfinding operations".

To create an item already in a triage state, add the role tag alongside the scope tag: `--fields "Tags={project-name}; needs-triage"`.

**Read a work item**:

```powershell
az-cli boards work-item show --id {id} --org https://dev.azure.com/{org}
```

**List open work items for this repository**:

```powershell
az-cli boards query --wiql "SELECT [System.Id], [System.Title], [System.State], [System.Tags], [System.AssignedTo] FROM WorkItems WHERE [System.TeamProject] = '{project-name}' AND [System.Tags] CONTAINS '{project-name}' AND [System.State] <> 'Closed' AND [System.State] <> 'Done' AND [System.State] <> 'Removed' ORDER BY [System.ChangedDate] DESC" --org https://dev.azure.com/{org} --project {project-name}
```

Add `AND [System.Tags] CONTAINS 'needs-triage'` (or any other role tag) to scope to a triage state.

**Add a comment**:

```powershell
az-cli boards work-item update --id {id} --discussion $comment --org https://dev.azure.com/{org}
```

**Apply a triage tag** - read the current tags, then re-send the full set including `{project-name}`:

```powershell
az-cli boards work-item update --id {id} --fields "Tags={project-name}; ready-for-agent" --org https://dev.azure.com/{org}
```

**Assign**:

```powershell
az-cli boards work-item update --id {id} --assigned-to {user-email} --org https://dev.azure.com/{org}
```

**Resolve** - in `{project-name}`, every type closes to **`Closed`**; `--state Done` fails on all of them with `The field 'State' contains the value 'Done' that is not in the list of supported values`. `Done` is not in this project's state set at all. Verified 2026-09-17 against the `workitemtypestates` API and a rejected write to #62:

| Type      | States                                               |
| --------- | ---------------------------------------------------- |
| `Epic`    | `New` / `Active` / `Resolved` / `Closed` / `Removed` |
| `Feature` | `New` / `Active` / `Resolved` / `Closed` / `Removed` |
| `Task`    | `New` / `Active` / `Closed` / `Removed`              |
| `Issue`   | `Active` / `Closed`                                  |

Anything testing for "finished" should still accept **both** `Closed` and `Done` (and `Removed`) - `Done` in case a differently-configured project or process template is ever queried, not because this project produces it.

- Close an Issue: `az-cli boards work-item update --id {id} --state Closed --org https://dev.azure.com/{org}`
- Finish a Task: `az-cli boards work-item update --id {id} --state Closed --org https://dev.azure.com/{org}`

### Parameter traps

Four places where this CLI's flags do not mean what they look like. Each one fails quietly or with an unhelpful usage footer rather than a clear error.

- **`--project` exists on `create` and `delete` only.** It is *not* a parameter of `show` or `update` - that is the documented signature, not a quirk. Passing it prints a bare usage footer with no explanatory line, which reads like a malformed command. A work item id is globally unique, so reads and updates don't need it.
- **`--fields` has two opposite grammars.** On `show` it is a **projection**: a comma-separated list of field *names* (`--fields System.Id,System.Tags`). On `create` / `update` it is an **assignment**: space-separated `"field=value"` pairs (`--fields "Tags={project-name}; needs-triage"`). Same flag, same `-f` short form. Passing `field=value` to `show` asks for a nonexistent field instead of setting anything.
- **Tags are replaced, not appended**, and their order is not preservable. `--fields "Tags=..."` overwrites the entire tag set, so read the current tags first and re-send the ones you want to keep - including `{project-name}`. Azure DevOps also **normalises tags into alphabetical order on write**, so never assert, verify, or "fix" tag order - only presence. Colons survive fine, so `wayfinder:map` is safe.
- **`--description` takes HTML and replaces the whole body.** To append a section, read the current `System.Description`, splice against a unique anchor substring, and write the result back. Azure DevOps also **decodes HTML entities server-side** - send `&mdash;` and it stores and returns a real em dash. That is correct behaviour, not corruption: never "fix" it, and don't assert that a written payload reads back byte-identical.

Also worth knowing: `--expand` defaults to `all` on `show`, so a plain `work-item show` already includes the `relations` array.

## Pull requests as a triage surface

**PRs as a request surface: no.** *(Set to `yes` if this repository treats external PRs as feature requests; `/triage` reads this flag.)*

When set to `yes`, PRs run through the same tags and states as work items, using `az-cli repos pr` commands:

- **Read a PR**: `az-cli repos pr show --id {pr-id} --org https://dev.azure.com/{org}`
- **List open PRs**: `az-cli repos pr list --status active --repository {repository-name} --org https://dev.azure.com/{org} --project {project-name}`
- **Add a comment**: `az-cli repos pr reviewer add --id {pr-id}` / `az-cli repos pr update --id {pr-id}` (discussion via the portal or REST; `az-cli repos pr` has no `--discussion` flag)
- **Link to a work item**: `az-cli repos pr work-item add --id {pr-id} --work-items {work-item-id}`

Note: Azure DevOps PRs and work items are separate number spaces - `#42` always refers to a work item; use `az-cli repos pr show` explicitly for PRs.

## When a skill says "publish to the issue tracker"

Create an Azure DevOps work item with `az-cli boards work-item create` in `{project-name}`, tagged `{project-name}` and assigned to `{user-email}`. Use `Issue` type for features and Specs (Basic template), `Task` for implementation sub-tasks. Pass `--description` directly rather than piping a file.

## When a skill says "fetch the relevant ticket"

Run `az-cli boards work-item show --id {id} --org https://dev.azure.com/{org}`. The user will normally pass the work item ID directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single work item with **child** work items as tickets. Every one of them also carries the `{project-name}` scope tag.

- **Map**: an `Issue` tagged `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `az-cli boards work-item create --type "Issue" --fields "Tags={project-name}; wayfinder:map" --org https://dev.azure.com/{org} --project {project-name}`. Created **unassigned** - no `--assigned-to`.
- **Child ticket**: a `Task` linked to the map by Azure DevOps' **native parent/child link** - `az-cli boards work-item relation add --id {ticket} --relation-type parent --target-id {map} --org https://dev.azure.com/{org}`. Tagged `{project-name}; wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Skip the `needs-triage` tag: wayfinder tickets are triaged by construction. Created **unassigned** - do not pass `--assigned-to` at create time, since assignment is what marks a ticket claimed. Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: the **native predecessor/successor dependency link** - the canonical, UI-visible representation, and what renders the frontier in Azure Boards and Delivery Plans. `az-cli boards work-item relation add --id {blocked-ticket} --relation-type predecessor --target-id {blocker} --org https://dev.azure.com/{org}` reads as "blocker must come first". A ticket carries **both** directions, so filter on `Predecessor` for its blockers and `Successor` for what it blocks. A ticket is unblocked when every predecessor is finished (`Closed` **or** `Done`). Verify the direction once per environment before wiring a whole map - inverting it renders the frontier backwards, which defeats the only reason to use native links.
- **Frontier query**: list the map's children (`az-cli boards work-item relation show --id {map} --org https://dev.azure.com/{org}`, keeping relations whose `rel` is `Child`), then drop any that are finished, have an unfinished `Predecessor`, or carry a `System.AssignedTo` value; first in map order wins. Use `relation show` rather than plain `show` here - it fills `rel` with the friendly names `Child` / `Parent` / `Predecessor` / `Successor` instead of raw link-type strings. There is **no `relation list` subcommand**: only `add`, `remove`, `show` and `list-type`. Confirm the friendly names resolve in your org with `az-cli boards work-item relation list-type --org https://dev.azure.com/{org}`; they map to `System.LinkTypes.Hierarchy-Reverse` / `-Forward` and `System.LinkTypes.Dependency-Reverse` / `-Forward`.
- **Claim**: `az-cli boards work-item update --id {ticket} --assigned-to {user-email} --org https://dev.azure.com/{org}` - the session's first write. An open, unassigned ticket is unclaimed.
- **Resolve**: post the answer with `--discussion`, set the terminal state to `Closed` (every type in this project - see "Resolve" above), then append a context pointer (link + gist) to the map's Decisions-so-far. Findings and prototypes stay as files in the repository and are **linked** from the ticket, not pasted into it.
