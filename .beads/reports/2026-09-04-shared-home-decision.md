# Shared DSH Home Decision

## Decision

**Keep Desktop, Web, and TUI data stores separate.** The user selected `Keep Data Stores Separate` on 2026-09-04. No shared-home, runtime-lock, or viewer implementation is authorized for this release.

This preserves concurrent surface use and avoids introducing a shared JSONL writer before exclusive ownership is implemented.

## Retained Root Contract

| Surface             | Current Default                      | Recovered Legacy Source            | Explicit Isolation            |
| ------------------- | ------------------------------------ | ---------------------------------- | ----------------------------- |
| Packaged Desktop    | `<appData>/TockTeam-Desktop/dsh`     | `<appData>/Oh-DSH-Desktop/dsh`     | `--user-data-dir`             |
| Development Desktop | `<appData>/TockTeam-Desktop-Dev/dsh` | `<appData>/Oh-DSH-Desktop-Dev/dsh` | `--user-data-dir`             |
| Web                 | `~/.tockteam-web/dsh`                | `~/.oh-dsh-web/dsh`                | `--data`, `TOCKTEAM_WEB_HOME` |
| TUI                 | `~/.tockteam`                        | `~/.ohdsh`                         | `--data`, `TOCKTEAM_TUI_HOME` |

`~/.dsh` remains excluded from automatic recovery. Current flags and variables remain authoritative over legacy compatibility variables. Electron/Chromium, launcher, log, Marketplace, and credential ownership does not change.

## Deferred Contract

If revisited, the reviewed proposal is still the minimum acceptable design:

- share only DSH state at `~/.tockteam`, never the entire Electron product root;
- let `TOCKTEAM_HOME` override defaults and accept `OH_DSH_HOME` only as a lower-priority compatibility input;
- keep Development Desktop and every explicit per-surface root isolated;
- copy sources without deletion, accept same-content duplicates, preserve an existing destination, and stop with a reviewable report for different-content collisions;
- enforce one atomic cross-process writer owner before migration, profile, Marketplace, preference, credential, or runtime writes;
- keep contention fail-closed unless a separately proven mutation-free viewer is approved.

No part of that deferred contract ships under the current decision.
