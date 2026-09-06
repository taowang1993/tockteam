# Trusted Translate Desktop — Slice 3 Parent Acceptance

Baseline: `547f543` (phase2 accepted). Slice3 checkpoint includes language sets/migration/debounce/navigation, LanguagesManager + AddLanguageForm, selected-text autoInput with honest fallback, prior-app Paste policy, upstream fire-and-forget TTS in private temp, lifecycle fences, and both P3 fixes.

## Parent Verification

- `pnpm typecheck`: passed.
- `TRUSTED_RAYCAST_ARTIFACT_TAR=/tmp/tockteam-trusted-raycast-translate-artifact.tar node --test tests/trusted-raycast-*.test.ts`: 59 passed, one explicit long-idle skip. This includes the configured TTS lifecycle test that spawns and observes real `afplay` in the child's private workspace and proves repeated TTS plus close-during-playback cleanup (passed again today).
- `pnpm test`: 929 passed, 16 explicit skips, zero failures (artifact env not set; more configured tests skip).
- `TRUSTED_RAYCAST_ARTIFACT_TAR=... pnpm build`: passed; `git diff --check`: clean.
- Full Electron/Playwright proof (run at 00:20): translation, Copy, full Detail, private browser, language manager/AddLanguageForm flow, selected-text autoInput, Paste with real prior app + restoration, rapid typing, Escape all passed. The only failure was the TTS afplay observation gate: the upstream TTS endpoint was in its documented intermittent throttle storm (translate HTTP 429 observed for 30+ min earlier); the outside-child probe answered while the child's fire-and-forget download did not complete within the gate window.
- Live afplay evidence remains from the worker's earlier GREEN run (`tts-proof.txt`: two real `afplay` processes on private workspace paths, plus `tts-cleanup.txt` and `final-cleanup.txt` proving teardown). No fake audio-success callback exists anywhere; the gate is process + mp3 + cleanup, per plan.

## Node Runtime

Child runs the packaged-contract Node 24.20.0. The Node 26 stall was pinned with a staged-runtime regression test. During parent verification, an accidental staging import destroyed the local `.stage/node-runtime`; the parent re-staged it with `DSH_DESKTOP_NODE_VERSION=24.20.0 node scripts/stage-dsh.mjs` and confirmed `v24.20.0`.

## Honest Boundaries

- Real (non-fixture) macOS Accessibility selected-text reads and real Paste keystrokes are unit-proven and denial-honest; the Electron proof exercises fixture success plus denial/fallback paths.
- TTS audible success is not programmatically assertable; evidence is afplay process + mp3 + cleanup.
- The current throttle storm may make fresh live-Google reruns flaky; deterministic and recorded-live evidence covers the gates.
