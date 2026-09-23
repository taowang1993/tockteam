# Local PR Readiness Evidence

## Scope and Authority

The user explicitly approved publishing the **current branch**, including the earlier unpublished Launcher/Coder commits inherited from local `main`, and running the existing GitHub checks. This does not authorize a merge or PR creation. The published base at inspection was `fe080d15`; the last product change is `80e103d7`.

This report records local acceptance. Final branch CI status is authoritative on [GitHub](https://github.com/taowang1993/tockteam/actions/workflows/ci.yml?query=branch%3Atutor) and in `tockteam-yoam.14`; a passing published-base run is not evidence that the new branch passes.

## Feature Evidence

The four earlier independent implementation rechecks remain accepted; they were not repeated. The earlier six-theme, split, linked-view, merge/recovery and authenticated-reload proofs remain valid within their stated boundaries.

A fresh independent verifier now directly exercised **note-local** Reading Find and exact Source/Live Preview Undo/Redo. Resumed verifier `3a7708cc-ee90-41b8-9cfb-7e76ee6e8b90` returned **FEATURE: works**. Reading query `Source formatted phrase.` produces `1 / 1` across three inline fragments with bold markup retained. Both editing modes preserve the exact typing-before, Replace All, typing-after sequence through three Undo and three Redo operations. This is in-memory history proof, not a save/reload claim.

The first workflow timed out during navigation and is not accepted. Its full app tree was stopped before a same-protocol retry. The retry's original Find JSON also retains a later hidden-select driver timeout: only its completed Find assertions and open-Find screenshot are accepted. The subsequent successful edit proof uses visible menu controls and completes both editing modes. No failed step was converted into a success or removed from its original artifact.

The parent separately verified:

- All 34 current menu entries and **25 px** rows against the **24.9 px** reference.
- Home/End, both keyboard submenus, all five linked-view choices, viewport containment, and Escape focus restoration.
- Bookmark creation, title edit, movement into an existing group, stable ID/path, cancellation, authenticated reload, and removal without deleting the group or changing the note file.
- The group was seeded as an initial fixture condition; every bookmark mutation used the visible UI. No group-creation UI is claimed.
- The menu screenshot is intentionally scrolled after End; it is Copy Path interaction evidence, not a claim that every entry fits without scrolling.

Driver corrections wait for actual focus and submenu exit/unmount before the next keyboard assertion. Reloads dismiss the existing API-key prompt through TockCoder's visible controls before returning to TockTutor; no native picker, state-forced success, or foreground automation is used.

## Small Product Correction

The bookmark option now reads **No Group**, matching the project's Title Case contract. One assertion added to the existing dialog test failed first, then passed after the one-string correction. No component, transaction, or synchronization behavior changed.

## Local Checks

| Check | Result |
| --- | --- |
| Workbench package tests | 359 Node + 578 Vitest passed |
| Complete menu component file | 101 passed |
| Native authorization, bridge, abort, reveal and authenticated page routes | 24 passed |
| Nested/root typechecks and builds | Passed |
| Quick stage, build-manifest validation, `git diff --check` | Passed |
| Comparable Workbench React Doctor scan | 58/100, unchanged; 80 warnings |
| Additional whole-workspace React Doctor scan | 33/100; broader, non-comparable scope with existing errors/warnings; not a clean quality gate |
| Most recent root aggregate | 1,368 passed; 5 environment-denied failures; 18 skipped |
| Most recent runtime aggregate | 207/208; Host-death inventory denied by environment |

The scoped React Doctor command is `react-doctor plugins/tocktutor/packages/tockteam-tocktutor-workbench --verbose`. The additional `react-doctor plugins/tocktutor --verbose` scans seven projects and must not be compared to the Workbench-only baseline. No rules were disabled or synchronization code rewritten for scores.

## Environment Diagnosis and CI

A minimal Node probe, without application code, fails to execute `/bin/ps` with `EPERM`. A minimal `/usr/bin/sandbox-exec` probe fails with `sandbox_apply: Operation not permitted`. The affected process-inventory implementation/test blobs are byte-identical to published `main`; `environment.json` records hashes and probe results.

The published base passed **all six CI jobs**, including both macOS architectures, Linux, Windows, runtime smoke, and Nix: [run 35343245641](https://github.com/taowang1993/tockteam/actions/runs/35343245641). This supports the environment diagnosis, not branch acceptance. The user authorized publishing the current branch so its exact revision can run these gates without changing tests or bypassing local restrictions.

## Geometry, Isolation, and Cleanup

All five allowlisted screenshots are **3024 × 1898**, from **1512 × 949 CSS pixels**, DPR 2, explicit built-in dark and no active skin. Physical windows remained unfocused inside display 11 at `(1512,30,1366,994)`.

| Run | Root PID | Outcome | Remaining Processes |
| --- | --- | --- | --- |
| `a17dd124-f921-4c4b-b5ce-f43b8e045fd9` | 68537 | Timed-out verifier; not accepted | None |
| `a4bdb94e-b5b6-4a1d-8c39-967083088720` | 72637 | Independent Find/Undo proof | None |
| `63ee4af9-a727-4b08-bb07-7eb73dad1d11` | 75371 | Parent menu/bookmark proof | None |

Zero page/console errors in accepted scopes. Existing Electron development-CSP warnings remain disclosed. Fixture note bytes were unchanged by bookmarking. Clipboard and default-app effects remain intercepted, and actual OS association/installed-executable checks remain uncertified. No unsupported app launch or guard bypass was used.

## Artifacts

`ui/` contains the independent report, original scoped result JSON, assertion-bearing drivers, placement records, cleanup receipts, and five allowlisted images with SHA-256 hashes. Publication validated geometry and assertions, then atomically renamed the staged directory. No canonical screenshot or earlier proof was overwritten.
