---
name: oh-dsh
description: Audit new Oh-DSH releases and selectively port applicable behavior into TockTeam. Use this skill whenever work mentions Oh-DSH, checking for a newer Oh-DSH release, comparing Oh-DSH updates, reviewing Oh-DSH commits, or porting an Oh-DSH feature into TockTeam.
---

# Oh-DSH Update Workflow

Treat Oh-DSH as a research feed, not TockTeam's upstream branch. Review each new release against TockTeam's current architecture and the official DSH contracts, then port only behavior that belongs in TockTeam.

## Baseline

Use this immutable baseline for the next update audit:

| Field | Value |
| --- | --- |
| Repository | `https://github.com/hust-open-atom-club/oh-dsh.git` |
| Last fully audited target | `v0.1.12` |
| Peeled release commit | `19262643092f801b5db9f70c0995acdfe813311e` |
| Earlier audit cutoff | `889258f4cdc7339f2eccbf446f0d4e46e59adaa4` (`v0.1.11-31-g889258f`) |

Interpret "audited target" as a selective review boundary, not a wholesale merge claim. TockTeam reviewed through `v0.1.12`, ported applicable behavior, and documented rejected or deferred behavior.

Update this table only after you have reviewed every upstream change through a newer immutable release, recorded every disposition, landed and verified every approved port, and committed the resulting evidence. Keep the currently recorded release as the baseline when an audit or port is incomplete.

## 1. Read the TockTeam Contracts

1. Read `AGENTS.md` completely.
2. Read `.agents/references/architecture.md` and `.agents/references/self-evolving.md` completely.
3. Read `.beads/plans/2026-09-04-selective-oh-dsh-roadmap.md` for the previous audit decisions.
4. Read the source and tests for every TockTeam seam you may change.
5. Create or claim a Beads issue before implementation.

Preserve these boundaries throughout the audit:

- Keep official DSH packages and contracts authoritative.
- Keep DSH Profile + Loader as the only composition mechanism.
- Keep Desktop, Web, and TUI authority separate.
- Preserve TockTeam launchers, profiles, data roots, credentials, updater ownership, Marketplace transactions, and runtime lifecycle.
- Keep staging self-contained and offline at launch.
- Do not edit `upstream/*`, add an Oh-DSH submodule, or merge/rebase Oh-DSH history.

## 2. Select an Immutable Target

Resolve the requested stable release and verify its peeled commit directly from the remote:

```sh
OLD_TAG=<baseline-tag-from-table>
NEW_TAG=<requested-stable-tag>
git ls-remote https://github.com/hust-open-atom-club/oh-dsh.git \
  "refs/tags/${OLD_TAG}" "refs/tags/${OLD_TAG}^{}" \
  "refs/tags/${NEW_TAG}" "refs/tags/${NEW_TAG}^{}"
```

Stop when the new tag is missing, mutable evidence is all that is available, or the target is older than the recorded baseline. Ask the user before auditing an unreleased branch or prerelease.

Create a temporary checkout outside TockTeam and fetch only the two release boundaries:

```sh
OH_DSH_TMP="$(mktemp -d "${TMPDIR:-/tmp}/tockteam-oh-dsh.XXXXXX")"
git -C "$OH_DSH_TMP" init -q
git -C "$OH_DSH_TMP" remote add origin https://github.com/hust-open-atom-club/oh-dsh.git
git -C "$OH_DSH_TMP" fetch --depth=1 origin \
  "refs/tags/${OLD_TAG}:refs/tags/${OLD_TAG}" \
  "refs/tags/${NEW_TAG}:refs/tags/${NEW_TAG}"
git -C "$OH_DSH_TMP" rev-parse "${OLD_TAG}^{commit}" "${NEW_TAG}^{commit}"
```

Deepen the temporary checkout only as needed to make the release range available. Do not create a permanent research checkout.

## 3. Inventory and Classify the Delta

List every commit and changed path between the two peeled release commits. Record each changed path exactly once in a report under `.beads/reports/` with one disposition:

| Disposition | Meaning |
| --- | --- |
| `Already Present` | TockTeam already has equivalent behavior; cite its source and test. |
| `Port` | The behavior belongs in TockTeam; name the guarded downstream seam and failing test. |
| `Adapt` | The idea applies, but Oh-DSH's implementation violates a current TockTeam or DSH contract. |
| `Defer — Decision Required` | The change needs explicit product or architectural approval. |
| `Reject — Boundary` | The change conflicts with TockTeam authority, security, identity, or composition rules. |
| `Not Applicable` | The change serves Oh-DSH-only branding, releases, installers, infrastructure, or obsolete runtime assumptions. |

Read each relevant upstream file and its tests completely before assigning a disposition. Compare behavior rather than filenames, and search TockTeam before proposing new code.

Check especially for changes to:

- DSH runtime versions, public APIs, Profiles, Cordis plugins, and session contracts;
- Electron IPC, navigation, permissions, preload, updater, and filesystem authority;
- Web bind/authentication behavior and browser-visible secrets;
- TUI renderer, auth, presets, terminal output, and self-update behavior;
- staging, packaging, symlinks, native dependencies, and installed-artifact workflows;
- state roots, migrations, locking, Marketplace mutation, and recovery.

Reject wholesale parity as a goal. A skipped change with a documented boundary is a complete audit result.

## 4. Decide Before Implementing

Summarize the release delta for the user before changing code. Include:

- old and new tags plus peeled commits;
- commits and paths reviewed;
- `Already Present`, `Port`, `Adapt`, `Defer`, `Reject`, and `Not Applicable` counts;
- proposed TockTeam seams and focused checks;
- security, migration, packaging, or release-evidence impact;
- decisions that require explicit approval.

Ask for explicit approval before changing shared data homes, runtime ownership, authentication surfaces, credential handling, Marketplace authority, release ownership, or other high-stakes architecture.

## 5. Port the Smallest Approved Behavior

For each approved change:

1. Add the smallest failing regression check first.
2. Reuse existing TockTeam helpers and public DSH contracts.
3. Implement through TockTeam-owned adapters or Cordis plugins.
4. Update every owning layer only when the behavior requires it.
5. Preserve stricter TockTeam validation and security when Oh-DSH is looser.
6. Commit coherent slices frequently.

Do not copy Oh-DSH's agent loop, plugin loader, product identity, release/update ownership, website, local network installer, or runtime assembly.

## 6. Verify and Advance the Baseline

Run focused checks first, then every affected package, typecheck, build, staging, smoke, and installed-evidence gate required by `AGENTS.md`. Stop every process started for verification.

Before completion:

1. Confirm every upstream commit and changed path has one recorded disposition.
2. Confirm every approved port has a regression check and every rejection cites a boundary.
3. Run `git diff --check` and inspect `git status --short --branch`.
4. Remove the exact temporary checkout only after the report is complete:

```sh
rm -rf -- "$OH_DSH_TMP"
```

5. Update the baseline table to the new stable tag and peeled commit only after all selected work and evidence are committed.
6. Validate this skill after changing its baseline:

```sh
skill-validator check --strict .agents/skills/oh-dsh
```

7. Close the Beads issue and push only with explicit authority.

## Completion Criteria

Complete an Oh-DSH update only when the target is immutable, the full release delta is classified, approved behavior is verified through TockTeam-owned seams, deferred and rejected behavior is explicit, the temporary checkout is removed, and the baseline identifies the newest fully audited stable release.
