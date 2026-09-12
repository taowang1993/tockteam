# Mole Security Contract and Feasibility

Issue: `tockteam-3l3.5`. Decision: **Not Admitted — Implementation Paused**.

The security-design task is complete; this is not a claim that Mole is supported. None of its ten commands has a useful implementation under the currently admitted authority. Do not add a placeholder extension, permissive binary wrapper, runtime descriptor, or misleading read-only/dry-run mode merely to claim compatibility.

## Evidence and Scope

The public Raycast Store still identifies Mole as **Featured**, not proven Recommended. The independently retrieved manifest and effect-bearing source are pinned to [Raycast extensions commit `8a4409d03a593ea0b69b825b525c80753102a379`](https://github.com/raycast/extensions/tree/8a4409d03a593ea0b69b825b525c80753102a379/extensions/mole).

- Manifest: 6,697 bytes; SHA-256 `03101af797ab63a64435040aefb4c837c7b8c2e45ab5fed1984f6972535cf45e`.
- Source tree: Git tree `b8c6025766a47cff1415b641582e30445fb46e5f`.
- Fourteen source files were retrieved as inert text with bounded responses, fixed commit URLs, no redirects, exact tree-declared sizes and matching Git blob hashes. Durable hashes are in [the source manifest](2026-09-10-mole-source-manifest.json); original receipts remain in `/private/tmp/tockteam-mole-security-r1.b8Fuxy/source-receipts.jsonl`.
- Inspection covered the manifest, shared executable lookup/runner, installation fallback, and effect-bearing command paths. This is a threat-model/feasibility assessment, not an exhaustive upstream correctness audit or binary/license admission.
- No Mole binary or package was installed, built, imported, executed, updated, or given access to user files. The denied launch tests cannot resolve a runtime or start a process. No app was activated, no Terminal was opened, and no user cursor/input was controlled.

The previous dependency on Can I Use was scheduling-only. Static design and tests proving rejection do not require Can I Use to run; removing that dependency grants no Mole execution authority.

## Threat Model

Assets include user projects and home data, installed applications, credentials and settings, filesystem ownership, authentication/PAM configuration, running processes, system services, privacy-sensitive host telemetry, foreground focus, and TockTeam's package/update chain.

Inputs that cannot create authority include extension preferences, arbitrary `molePath` values, local executable replacements, inherited environment variables, CLI output, discovered filenames and app identifiers, renderer actions, stale confirmations, or an upstream command's `--dry-run` label.

The trusted-extension Node process is **not an OS sandbox**. Importing Mole and then denying only its Raycast callbacks would be insufficient: the pinned source directly imports `fs` and `child_process`. The effective current boundary is refusing its descriptor and startup **before any source execution**, combined with denying unknown IPC effects. These tests do not assert confinement of arbitrary trusted Host/Cordis code.

### Source-Backed Risks

| Source | Observed Behavior | Consequence |
| --- | --- | --- |
| `src/utils/mole.ts` | Accepts a custom binary whenever `existsSync` succeeds; otherwise probes two machine-installed paths. Executes it with inherited HOME/PATH/SHELL and other values. | Existence and a pathname do not establish immutable executable/dependency identity or scoped authority. |
| `src/utils/mole.ts` | Resolves combined stdout/stderr even after an execution error when output exists. | Output text must not be accepted as proof of successful mutation. |
| `src/system-status.tsx`, `src/health-menu-bar.tsx` | `useExec(molePath, ["status", "--json"])`; repeated refresh/background operation, with cached raw status in the menu-bar path. | “Status” still launches an unadmitted executable and exposes telemetry; it is not an existing bounded read capability. |
| `src/clean.tsx`, `src/optimize.tsx` | Launch dry-run previews, then invoke global `clean` or `optimize` rather than apply an immutable list of reviewed objects. | A preview or aggregate confirmation does not bind subsequent mutations to exact targets. |
| `src/purge.tsx` | Executes global purge and also passes output-derived paths to `trash`; unmount invalidates an ID without terminating that scan process. | Both CLI and native trash paths need independent controls; stale UI suppression is not descendant teardown. |
| `src/analyze.tsx` | Offers Home and System Root, trusts CLI path fields after basic type checks, and exposes `trash(entry.path)` without a confirmation at that action. | Browsing is not workspace-confined; output-selected paths must never become mutation authority. |
| `src/installer.tsx` | Scans Downloads, Desktop and Documents using filesystem APIs, follows `statSync`, and trashes selected/all installers. | User-home reads and destructive operations occur outside an admitted Session/Workspace capability. |
| `src/uninstall.tsx` | Scans user/system Library and other global paths using name heuristics, invokes `defaults`/`du`, and trashes application plus residual candidates. | Heuristic names are not ownership proof; system/user data, symlink races and shared vendor files are exposed. |
| `src/touchid.tsx` | Executes status, then can run `mo touchid enable/disable` through AppleScript in an activated Terminal. | Elevation/authentication changes and foreground app control are separate prohibited authorities. |
| `src/update-mole.tsx` | Runs `mo update` from a mount effect, followed by a version query. | Merely opening a view can mutate an external executable, outside TockTeam's updater ownership. |
| `src/components/MoleNotInstalled.tsx` | Launches a Homebrew extension, opens a deep link, or activates Terminal to run Homebrew or a mutable remote shell installer. | Missing dependencies must not cause installation, network-script execution, nested extension launch or foreground control. |

These observations justify exclusion; they do not characterize the external Mole binary as malicious. That binary and its helper/update closure were not evaluated.

## Finite Command and Effect Contract

**Allowed executable Mole operations: none.** All names below are exact pinned manifest command IDs.

| Command | Current Decision | Primary Missing Authority |
| --- | --- | --- |
| `system-status` | Deny | Pinned finite telemetry provider; no arbitrary executable |
| `health-menu-bar` | Deny | Telemetry provider plus bounded background lifecycle/cache ownership |
| `clean` | Deny | Exact-object, reversible, scoped destructive operation |
| `optimize` | Deny | Explicitly owned system mutations and recovery |
| `uninstall` | Deny | Verified ownership of apps/residuals and scoped removal |
| `purge` | Deny | Verified project/artifact ownership and scoped removal |
| `analyze` | Deny | Anchored workspace-only reads; no returned-path authority |
| `installer` | Deny | Explicit user-folder selection and safe object-bound removal |
| `touchid` | Deny | Authentication/elevation/system-configuration changes are forbidden |
| `update-mole` | Deny | External updater mutation is forbidden |

The effect set excludes arbitrary command execution, `execFile`, `spawn`, `useExec`, filesystem reads/enumeration, trash/delete, sudo/elevation, Touch ID/PAM changes, installation/update, Terminal/AppleScript activation, nested extension launch, and inherited copy/paste/browser/preferences effects under a Mole identity. An extension ID is not a bearer credential: existing session, generation, owner, revision and action authentication must remain intact.

Use existing descriptor/IPC/manager rejection; **no new all-denying policy class or generic dispatcher is needed**.

## Confirmation Policy

No confirmation can unlock a prohibited operation. Renderer-supplied `confirmed`, `dryRun` or `elevated` flags have no authority. There is no “Confirm Anyway” path, background install fallback, or automatic update on opening a view.

A future separately approved operation would require a finite main-owned request, exact admitted artifact and helper closure, explicit selected scope, an immutable preview of exact objects, and a main-owned confirmation bound to that scope, object identities and current session/revision. Replacement, changed objects, canceled prompts, errors, timeout, close or owner changes must revoke the approval. Apply must revalidate held objects, refuse symlink/path substitution and protected data, surface partial failures honestly, and prove full process-tree cleanup. System authentication and external updater controls remain excluded unless their ownership is separately redesigned and approved.

This is a re-entry checklist, not permission to implement those capabilities now.

## Feasibility Decision

An exact binary hash alone cannot make a globally acting CLI workspace-safe. A dry-run flag or subprocess also does not enforce confinement. Useful unchanged-source Mole behavior therefore cannot be preserved with the current allowed operations.

Stop at exclusion. A future first-party workspace artifact inspector or narrow system-status tool might be separately useful, but would be a new scoped feature—not evidence that this Mole extension works. Reopen admission only after a useful finite operation and its authority are explicitly approved and independently evidenced. No unsupported-operation stub should report success.

## Executable Denial Evidence

`tests/trusted-raycast-mole-denial.test.ts` verifies:

1. All ten commands fail admission, including attempts to use existing extension identities. Mole trust actions and view events are rejected.
2. Fourteen prohibited effect names are rejected under Mole and each currently admitted extension identity, including asserted confirmation/dry-run/elevation. Mole cannot inherit existing native effects.
3. The actual manager rejects all ten commands before runtime resolution or any effect callback. Injecting a Mole binary preference into Translate is also rejected.

These are passing acceptance tests of an existing denial boundary, not a newly implemented behavior. No permissive version was introduced to manufacture a red result. There are no source changes or new runtime privileges.

Verification:

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH ./node_modules/.bin/tsx --test tests/trusted-raycast-mole-denial.test.ts
PATH=/opt/homebrew/opt/node@24/bin:$PATH ./node_modules/.bin/tsc --noEmit
git diff --check
```

Three tests passed; typecheck and whitespace checks passed. Evidence: `/private/tmp/tockteam-mole-security-r1.b8Fuxy/denial-tests.txt` and `typecheck.txt`. No Mole execution or installed smoke is necessary or authorized for an exclusion decision.
