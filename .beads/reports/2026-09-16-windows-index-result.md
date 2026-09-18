# Windows Index Gate — Scoped Native Acceptance

## Corrected Run Accepted

After reviewing the installation failure below, the user separately authorized publishing `b19d0fbe0deafbf1ead4572c3b92553f88988d1d` to the same review branch and running one corrected check. [Run 35091920059](https://github.com/taowang1993/tockteam/actions/runs/35091920059), attempt 1, **passed** on Windows x64, Node 24.20.0, with actual Koffi 3.1.6 recorded and checked.

- **Six native index cases passed** against fresh installed packages. Live public search ran in Host **8908** with index child **7432**, narrowed three documents to two candidates, and returned only `Alpha.md`.
- All eleven installed runtime JavaScript hashes match the current compiled bytes; the parent independently recomputed them from the downloaded receipt.
- Lease contention and the simultaneous first-creation race recorded real `SQLITE_BUSY`; exactly one racer acquired its lease. Persistent reopen required zero document rereads and preserved the main file's identity.
- Platform-prepared launch cancellation created no child. The successful SQLite callback withheld in child **5956** caused a progress-stall failure while the Host remained responsive; settlement completed approximately **5053 ms** after the marker.
- Eight index PIDs were stopped: **7432, 3892, 8156, 8460, 4344, 3676, 1900, 5956**. Every retained process handle had to be signaled immediately when its facade's `close()` returned; no post-return waiting or emergency cleanup counted as success.
- The separate owner/launcher gate also passed: **six owner cases and 13 launcher cases**. Failed creation retained **212 → 212** handles; the deliberate one-handle sensitivity check recorded **212 → 213 → 212**. All three eight-handle ledgers passed verification, and all launcher retained handles were signaled immediately after return.
- Both independent inventories were empty, neither gate needed emergency cleanup, both native scratch roots were removed, and the workflow's package/evidence-root cleanup passed.

Durable evidence: [index receipt](windows-index-2026-09-16/35091920059-index.json), [owner/launcher receipt](windows-index-2026-09-16/35091920059-proof.json), [SDK receipt](windows-index-2026-09-16/35091920059-sdk.json), and [run metadata](windows-index-2026-09-16/35091920059-run.json). The parent validated commit/platform/version, all module hashes, cases, handle ledgers, sensitivity, inventories and removal fields. These checks establish this gate's native acceptance, not complete product acceptance.

Independent read-only artifact audit `56758fd5-a2e9-4a0a-a68b-1cdd3cffa260` found no issues and accepted this scoped native Windows evidence. It reconciled all three ledgers and read the parent's saved eleven-module hash comparison; it did not execute commands itself. All three review references were applied.

Only the review branch was published. No main update, merge, release or additional run was performed. The initial failed run remains preserved below.

## Initial Authorized Run

The user authorized publication only to the existing `verify/windows-owned-process-20260916` branch and **one** bounded Windows check. Commit `50255ef49d1f8effc525222cf5a190a350d4f32b` was published there. `origin/main`, pull requests and releases were not changed.

[Run 35090732736](https://github.com/taowang1993/tockteam/actions/runs/35090732736), attempt 1, **failed during fresh package installation**. No repeat was launched.

- The compiled x64 SDK probe passed; [receipt](windows-index-2026-09-16/35090732736-sdk.json).
- Owner/model checks: 18 passed, nine POSIX skips, zero failures.
- Launcher models: 23 passed, one conditional skip, zero failures.
- Both fresh runtime/vault tarballs built. SQLite's allowed installation script completed.
- Fresh installation then rejected an undecided Koffi build script.
- Both native acceptance steps were **skipped**. No native index or new owner acceptance is claimed.
- Evidence upload and removal of the workflow-owned package/evidence root passed. Only the SDK artifact exists; there is no native worker/process-inventory receipt for this run.

[Run and step metadata](windows-index-2026-09-16/35090732736-run.json) preserve the failed step and successful cleanup.

## Exact Failure and Local Correction

The install log reported:

```text
The "pnpm" field in package.json is no longer read by pnpm.
The following keys were ignored: "pnpm.overrides".
ERR_PNPM_IGNORED_BUILDS Ignored build scripts: koffi@3.3.0
```

The fixture's intended Koffi 3.1.6 override was in the obsolete manifest location. Removing `--ignore-scripts` to permit SQLite exposed the missing explicit Koffi build decision. This is a verification-installation defect, not a reproduced native index failure or an unexplained infrastructure flake.

The correction was verified locally before obtaining separate publication/run authority:

- Move `overrides.koffi: 3.1.6` into the isolated `pnpm-workspace.yaml`.
- Permit `sqlite3` builds and explicitly deny Koffi builds, matching the existing repository policy; use Koffi's shipped prebuilt binary.
- Remove the ignored manifest field.
- Assert the actual loaded Koffi version in the worker and retain it in native acceptance receipts. Do not infer the resolved version from an intended configuration field or retroactively assign a version to older receipts.

A fresh local install using the policy extracted directly from the workflow succeeded. Koffi reported 3.1.6 and executed its native address operation; SQLite executed `SELECT 1`. Installer process cleanup and temporary-root removal passed. [Local policy receipt](windows-index-2026-09-16/local-pnpm-policy.json). This is macOS configuration/binary-loading evidence, **not Windows acceptance**.

## Prepared Native Index Coverage

The gate reuses the existing copied-executable supervisor, independent Windows inventory, identity-held emergency cleanup, partial receipts, 90-second worker deadline and three-minute workflow step. The new worker covers:

1. Live Cordis/public indexed search with exact false-positive filtering and a preserved v2 sentinel.
2. Paged inventory, Unicode chunking, incremental reconciliation and in-flight invalidation fencing.
3. Real `SQLITE_BUSY` lease exclusion, followed by persistent reopen with zero document rereads and unchanged main-file identity.
4. Simultaneous first creation with exactly one successful lease and one recorded `SQLITE_BUSY`.
5. Cancellation after platform preparation but before actual launch.
6. A successful real SQLite callback deliberately withheld from the child engine: Host responsiveness, progress-stall failure and owned termination.

Windows observers retain actual process handles and require them to be signaled immediately when `close()` returns, before releasing the observers. A successful gate must account for eight stopped index PIDs. All eleven installed runtime JavaScript modules must match the source build.

The same worker passed all six cases locally on macOS, including eight disappeared PID/groups and approximately 5010 ms from held-callback marker to settlement. This local run neither supplies Windows evidence nor attributes the historical stall.

## Checks and Remaining Authority

- Pre-publication read-only review `55a16658-0f2f-4210-b307-22130e929e2d`: no findings; approved only the authorized single review-branch run.
- Local owner/launcher proof controls: 38 passed before publication.
- Follow-up read-only review `51425732-3897-4732-accb-287aa8bad974`: no findings; local configuration/version guard only, no repeat-run authority.
- Installation correction controls: `node --test tests/owned-process-windows-proof.test.ts` — 14 passed.
- `pnpm run typecheck`, workflow YAML parsing, syntax, manifest and diff checks passed.
- All three review references were applied. The parent executed the checks; reviewers inspected source and evidence.

The separately authorized corrected run above supplies scoped native Windows index acceptance. Subsequent local [native-clock/Host-death checks](2026-09-16-index-remaining-native-gates.md) and [installed Desktop evidence](2026-09-16-installed-index-desktop-result.md) cover macOS only; the latter accepts indexed UI search/opening and command effect/cleanup, not a fully passing workflow UI test. The additional native Windows clock and blocked-child Host-death recovery checks subsequently passed in [authorized run 35127983115](2026-09-16-windows-index-recovery-result.md). Historical causation remains unproved. `tockteam-bon` remains open; `tockteam-fsq` closes for its original bounded cache/descendant-ownership scope, not overall release acceptance. Further Windows runs require new authority; no merge or release was performed.
