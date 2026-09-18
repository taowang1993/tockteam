---
name: worktree
description: TockTeam Git worktree lifecycle and safety rules. Always use this skill before creating, entering, listing, updating, removing, or pruning a worktree; creating a feature branch or isolated workspace; delegating work into a managed worktree; or deciding which commit should be its base.
compatibility: TockTeam repository with Git, Beads, Intercom, mise, pnpm, and the configured upstream submodules.
---

# TockTeam Worktree Workflow

Use worktrees to isolate Git indexes and generated files without splitting TockTeam's issue coordination. Keep native Git state, Beads ownership, active sessions, and submodules explicit throughout the lifecycle.

## 1. Inspect Before Acting

Run these checks from `/Users/max/projects/tockteam` before any create, update, remove, or prune operation:

```sh
git status --short --branch
git worktree list --porcelain
git branch --all --list
```

Use Intercom when available to identify sessions in the main checkout and every affected worktree. Treat an unexplained worktree, branch, or changed path as externally owned until its owner confirms otherwise.

If the subagent harness created a managed worktree, inspect and control it through the subagent workflow that owns it. Do not manually remove, repoint, prune, or reuse it while that workflow or its parent session may still need it.

Before creating a worktree, check whether the requested branch and path already exist. Report a collision and ask the user instead of inventing another name or repointing either resource.

## 2. Choose the Base Explicitly

Remember that a new worktree contains committed objects only. It cannot include uncommitted files from another checkout.

Choose one base and state it before creation:

- Use `origin/main` only when the task should start from the latest pushed state. Run `git fetch origin` immediately before resolving it.
- Use an exact commit when the task depends on reviewed local commits that are not pushed yet.
- Wait for the owning session to commit when the task depends on its current uncommitted work.

Do not silently use local `main`, `origin/main`, or another feature branch. If the correct base is ambiguous, ask the user in non-technical terms whether to include the latest local work or start from the published version.

## 3. Create One Worktree

Use the user's domain name exactly. Do not normalize, abbreviate, or silently add separators. Place manually created TockTeam worktrees directly under:

```text
/Users/max/projects/worktrees/<domain>
```

Create worktrees serially because parallel `git worktree add` operations can race on shared Git metadata:

```sh
REPO=/Users/max/projects/tockteam
WORKTREE=/Users/max/projects/worktrees/<domain>
BRANCH=<branch>
BASE=<exact-commit-or-origin/main>

mkdir -p /Users/max/projects/worktrees
git -C "$REPO" worktree add -b "$BRANCH" "$WORKTREE" "$BASE"
```

Use `git worktree add "$WORKTREE" "$BRANCH"` instead when the branch already exists and the user explicitly wants to resume it.

Do not substitute `bd worktree create` unless its installed help supports the selected base exactly. Git owns checkout creation; Beads remains the shared task tracker.

## 4. Initialize the Checkout

Enter the new worktree and initialize only the dependencies TockTeam already declares:

```sh
cd "$WORKTREE"
git submodule update --init --recursive
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm install --frozen-lockfile
mise exec node@24 -- node --version
```

Do not copy `.env.local`, credentials, caches, `dist/`, `release/`, or generated files from another checkout. TockTeam's committed `.envrc` contains only `use flake`; use the repository's declared Nix environment when available, but keep Node commands on Node 24.

Verify Git and Beads routing:

```sh
git status --short --branch
bd worktree info
bd where
bd prime
```

Expect `bd where` to resolve `/Users/max/projects/tockteam/.beads`. TockTeam intentionally shares its repository-local Beads database across worktrees so issue claims and dependencies remain coordinated. Stop if it resolves anywhere unexpected; do not create a second `.beads` database or pass a worktree-local `--db` override unless the user explicitly changes this policy.

Claim the relevant issue before implementation:

```sh
bd show <issue-id>
bd update <issue-id> --claim
```

## 5. Work Safely

Keep one writer per worktree and coordinate shared files through Intercom and Beads. Run every command with the intended worktree as its current directory or explicit `-C` target.

Make small, coherent commits. Stage explicit paths and inspect the staged file list before every commit. Never pull another checkout's generated output into the worktree as a shortcut.

Push only with explicit authority. When authorized, push the worktree branch and open a pull request; never update `main` directly from the feature worktree and never squash-merge TockTeam pull requests.

Before changing the branch base, inspect cleanliness and coordinate with other owners. Fetching is safe; rebasing, merging, resetting, or force-updating requires an explicit task decision because each changes branch history or content.

## 6. Finish Before Removal

Complete the Beads close protocol, stop every app/server/child process started from the worktree, and inspect both repository and submodule state:

```sh
git -C "$WORKTREE" status --short --branch
git -C "$WORKTREE" submodule foreach --recursive 'git status --short --branch'
git -C "$WORKTREE" log --oneline --decorate -5
```

Confirm all intended work is committed and preserved on the required branch or remote. Ask the owning session before removing a worktree, even when it appears clean.

From the main repository, remove a clean worktree with Git:

```sh
git -C "$WORKTREE" submodule deinit --all
git -C /Users/max/projects/tockteam worktree remove "$WORKTREE"
git -C /Users/max/projects/tockteam worktree prune
git -C /Users/max/projects/tockteam worktree list --porcelain
```

If submodule deinitialization or removal refuses, stop and report the exact state. Do not use `rm -rf`, `--force`, reset, clean, branch deletion, or manual `.git/worktrees` edits unless the user explicitly authorizes discarding or has confirmed the work is preserved.

Keep the branch after worktree removal unless the user explicitly asks to delete it and its work is already merged or otherwise preserved.

## Completion Criteria

Finish a worktree operation only when the selected base is documented, path and branch ownership are confirmed, submodules and Node dependencies are initialized when needed, `bd where` points to the shared TockTeam database, active owners are coordinated, no unrelated checkout is modified, and the final `git worktree list --porcelain` matches the intended state.
