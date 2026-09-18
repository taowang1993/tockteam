# RC.1 Pinned-Summary Verification

## Outcome

`tockteam-9lt.17` is implemented in `b75b992e`, with additional lifecycle coverage in `b8a1d4db`. The pane now reads finalized summaries from the pinned runtime's `uiConversation.binding(id).target('chat')` source and its `ChatSnapshot.legacy.nodes`. Session lifecycle still comes from `sessions`; there is no conversation-state copy, Host change, explicit target activation, or new dependency.

The package's browser dependency metadata and Cordis service injection both declare the conversation owner. Existing Desktop/Web profile rows, build inventory, surface ownership, layout, and rendering remain unchanged. Missing chat data cannot fall back to obsolete SessionSnapshot nodes. Session or target replacement releases both subscriptions, resets expansion, and invalidates pending clipboard feedback even when replacement text is identical.

## Regression and Build Evidence

- RED: `node --test tests/pinned-summary.test.ts` reproduced `summary.unavailable` instead of `RC.1 context` through the mounted public plugin.
- RED: `node --test tests/pinned-summary-lifecycle.test.ts` caught missing browser dependency metadata.
- GREEN: `node --test tests/pinned-summary*.test.ts` — 11 passed after final test changes. Covers compaction precedence, assistant-only text, missing/malformed targets, lifecycle states, session/target replacement, old-source notification isolation, deferred clipboard completion, and zero subscriptions/global keydown listeners after disposal.
- `node --test tests/pinned-summary*.test.ts tests/web-profile.test.ts tests/right-panel-layout.test.ts` — 28 passed after final test changes.
- `pnpm typecheck` — passed after final test changes.
- `pnpm build` — passed; `node scripts/stage-dsh.mjs --quick` refreshed the staged browser bundles.
- `pnpm smoke:web` — passed: fresh composed profile, client graph/manifest agreement, served pinned-summary bundle, settings boundaries, skins, sidebar, workspace Git, and PTY cleanup.
- `git diff --check` — passed.
- **Non-passing wider gate:** `pnpm test` finished with 1,273 passed, 14 skipped, and one failure in the unchanged `tests/trusted-raycast-native-effects.test.ts:374` live Google Translate debounce integration. Its projection predicate timed out after approximately 25 seconds. The earlier v0.2.0 report recorded a connection failure in the same test, but this run does not independently establish that cause. Tracked as `tockteam-fno`; no assertion was weakened or skipped.

The fake DOM's capture-option normalization addresses a reproduced Node EventTarget difference: boolean capture removal left a listener, while `{capture:true}` removed it. Production browser listener registration/removal was not changed.

## Real Web Evidence

Fresh built bundles ran on the actual staged DSH `0.1.2-rc.1` Web surface, not a component replacement harness. Playwright CLI `0.1.19` used an isolated headless Chromium context and the existing configured DeepSeek credential copied with mode `0600` into the disposable DSH home. The original credential and `HOME` were untouched.

Observed flow:

1. Create a disposable workspace through the existing authenticated Web API, then create a session through the UI.
2. Send `Reply with exactly: Pinned Summary RC.1 Verified. Do not call tools.` through the real composer. Open the pane using its existing persisted preference and reload.
3. Verify `Ready`, `Latest Assistant Response`, and the exact finalized response in the pane.
4. Run the real `/compact` command. Verify `DSH Context Summary` with generated rich-text context.
5. Send a second exact-string request producing `Later Assistant Response Verified.`. Verify that the compaction summary still takes precedence.
6. Expand and copy the full summary; verify actual browser clipboard content exceeds the preview and feedback reads `Summary Copied`.
7. Create a new session; verify `data-state="blank"` and no previous content. Return to the original session; verify restored context and reset expansion.
8. Verify outside Escape preserves the pane and inside Escape closes it.

Workspace-picker setup initially launched two native `osascript` directory pickers. Both were terminated without native dialog interaction; setup switched to the existing Web API. The proof also records corrected setup assertions rather than hiding failed attempts.

[Machine-Readable Proof](rc1-pinned-summary-proof/proof.json) records the exact route `/`, `Standard mode`, state/content, source commit, bundle digest, theme, image hashes, setup corrections, and cleanup. Only these inspected screenshots were published transactionally:

- [Finalized Assistant Summary](rc1-pinned-summary-proof/assistant.png)
- [Context Summary After a Later Response](rc1-pinned-summary-proof/context.png)

Both captures verify **1512 × 949 CSS pixels at 2×**, yielding **3024 × 1898 PNG pixels**, built-in dark appearance, `document.documentElement.style.colorScheme === 'dark'`, and absent `data-tockteam-skin`. The root retains its `312px` content reservation. Browser console reported zero errors and zero warnings.

## Independent Review and Cleanup

Fresh read-only reviewer run `92a13815-7fff-46d5-921b-f17603a49b3b`, workflow `0256c5c3-55ff-4d09-baa2-1435968dc2bd`, found no issues in `b75b992e` after checking the installed RC.1 declarations and target activation implementation. Its two evidence limits were subsequently covered: the parent ran real DSH activation in Web and added deferred clipboard replacement coverage in `b8a1d4db`. The reviewer did not claim to run the tests or Web flow itself; the parent verified those separately.

The bounded Web root PID was `30208`; browser daemon PID was `30219`. All ten recorded wrapper/runtime/browser/picker PIDs were confirmed absent after cleanup. The disposable data root, copied credential, and temporary documentation checkout were removed. The Web smoke separately stopped its runtime and PTY. Mounted regression tests verify zero list/session/chat/locale subscriptions and zero document keydown listeners after plugin disposal.

## Scope Limits

No fresh Electron, installed-package, Nix, or hosted CI run was performed for this browser-client-only follow-up. Prior installed and hosted results remain historical evidence, not results for this commit. The wider root-suite Translate failure remains open independently of the fixed summary behavior, as does the Windows fixture-extraction timeout (`tockteam-77n`).
