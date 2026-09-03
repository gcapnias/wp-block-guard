# Handoff: Git Bundle Backup & Restore Guide for a Remote Repo

**Date:** 2026-09-02
**Requested by:** george@dot-see.com
**Status:** Guidance already produced in conversation; this handoff formalizes it as a step-by-step runbook for a coding agent to execute or hand to the user.

## Task

The user has a remote Git repository (multiple branches) that they want to:
1. Archive completely using `git bundle` (must capture **all** branches, not just the current one).
2. Delete the remote repository once the archive is verified.
3. Be able to fully restore the remote repository from the bundle **at any point in the future**.

No code changes, no repo state, no commits were touched in this session — this was a pure advisory/documentation conversation. There is no diff, PR, or issue to reference; the guide below is the deliverable itself.

## Step-by-step guide (for the next agent to execute or hand to the user)

### Phase 1 — Backup

1. Confirm the remote repository URL and required auth (SSH key or token already configured locally — do not print secrets).
2. Create a **mirror clone** (captures every ref: branches, tags, remote-tracking refs — not just checked-out branches):
   ```bash
   git clone --mirror <remote-url> repo.git
   ```
3. From inside the mirror clone, create the bundle with `--all`:
   ```bash
   cd repo.git
   git bundle create ../repo-backup.bundle --all
   cd ..
   ```
4. **Verify before trusting it** (do not skip):
   ```bash
   git bundle verify repo-backup.bundle
   git bundle list-heads repo-backup.bundle
   ```
   Confirm `list-heads` output includes every branch and tag expected. If any are missing, the mirror clone was incomplete — re-fetch and redo.
5. (Strongly recommended) Test-restore into a throwaway directory before deleting anything — see Phase 2, step 1.
6. Move `repo-backup.bundle` to durable, redundant storage **off the host that's about to be deleted** (e.g., another machine, cloud storage, or a second Git host). This is the single point of failure if skipped.

### Phase 2 — Restore (do this anytime later)

1. Clone directly from the bundle:
   ```bash
   git clone repo-backup.bundle restored-repo
   cd restored-repo
   ```
2. Branches will appear as `origin/*` remote-tracking refs. Recreate local branches for each:
   ```bash
   for b in $(git branch -r | grep 'origin/' | grep -v '\->' | sed 's/origin\///'); do
     git checkout -b "$b" "origin/$b" 2>/dev/null || true
   done
   ```
3. If restoring into a new hosted remote, point `origin` at it and push everything:
   ```bash
   git remote set-url origin <new-remote-url>
   git push origin --all
   git push origin --tags
   ```

### Phase 3 — Deleting the original remote

Only after `git bundle verify` succeeds (and ideally after a test-restore): delete the remote via the host's UI/API (GitHub/GitLab/Bitbucket) or `rm -rf` if self-hosted bare repo. This is a destructive, hard-to-reverse action — confirm with the user immediately before executing it if the agent has host credentials/API access to do so itself.

## Key pitfall to flag to the user/agent

Forgetting `--all` on `git bundle create`, or bundling from a clone that doesn't actually have every branch fetched locally, silently produces a bundle containing only `HEAD`/the current branch. The mirror-clone approach in step 2 of Phase 1 avoids this entirely — always prefer it over bundling an ordinary clone.

## Suggested skills for the next agent

- **wizard** — if the user wants an interactive script that walks them (or walks the agent) through the backup/verify/delete/restore sequence step-by-step with confirmations at the destructive step (deleting the remote), this skill is built for exactly that kind of one-off, human-in-the-loop infrastructure operation.
- **firecrawl-developer-index** — only if a question arises about specific Git bundle edge cases, version-specific `git bundle`/`git clone --mirror` behavior, or a reported bug/limitation — search issues/docs for the `git/git` project rather than relying on general knowledge.

No other project skills (br, tdd, code-review, etc.) apply — this task has no code changes, tests, or issue tracker involvement.
