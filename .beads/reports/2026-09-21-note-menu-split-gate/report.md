# Split-Pane Desktop Gate

This accepts the tested Split Right/Down behavior and the interim Source Mode affordance. **It is not acceptance of the complete eight-group menu or unrestricted Live Preview editing.**

## Verified Behavior

- Real simultaneous Source, Live Preview and Reading panes; shared-file changes propagate without redirecting edits to another file. Separate Source and Live Preview notes were edited and saved through the actual Desktop Host. Rich Source edits preserved exact CRLF, frontmatter and wikilinks.
- Nested Right/Down geometry, pointer resizing to 55%, keyboard bounds of 15–85%, close/collapse, independent Source scrolling (500px versus 0px), and pane-local Find.
- App entry-root reload restored exact layout, ratio and modes. A saved named workspace restored a three-pane mixed-axis layout at 85% after closing a pane, preserving tab/mode/revision state.
- Split Down retains focus in the new editor after menu dismissal. The lower-pane menu now starts at y48, below the 40px titlebar; its first row at y55 was activated with the pointer, and Close Pane remained reachable. Narrow 800px behavior was also exercised.
- Shared assistant toggles and pane-specific tabpanel references work. Absolute-path copy reached the intercepted main sink with the canonical path of the owning second document; this is not OS clipboard proof.
- The protected-note explanation and explicit **Edit in Source Mode** action use the existing guard. Keyboard activation changed only its owning pane while another pane stayed in Live Preview with its unsaved draft intact. A subsequent Source edit saved the protected fixture exactly. This is an interim safety affordance, not the requested future all-note editing solution.
- Actual CodeMirror caret: 19px high, `rgb(249, 250, 251)`, matching note text. Native CSS caret is transparent because CodeMirror draws the visible cursor.

## Fixes and Review

Three independent source-review passes corrected shared-draft, delayed-save, restoration, hydration, search and retention issues. Parent Desktop verification then found and corrected old-trigger focus restoration and menu overflow/titlebar overlap. A later reviewer caught a bare JSX comment rendered in the header; parent reproduced it with a failing component test, converted it to a JSX comment, rebuilt and verified the clean header in Desktop.

Parent checks: 138 route/session/settings tests and 180 component/editor/search tests passed before the final UI integration. Final command after the JSX correction:

```sh
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-panel-controls.test.tsx tests/route-split-panes.test.tsx tests/route-editor-readiness.test.tsx tests/editor-adapters.test.tsx --environment jsdom
```

**183 passed.** TockTutor typecheck, nested/root builds, manifest check, quick staging and `git diff --check` passed. Logs: `/tmp/tocktutor-split-ui-6Q2U8d/`. Earlier lifecycle worker checks included 149 Node tests, 180 component tests and root typecheck. No full-root or installed-smoke acceptance is claimed here.

## Capture and Cleanup

Final guard run: `c6c41285-c2e9-4779-962d-b4580b5896e3`, root PID8606, extended display11. Window `(1512,30,1366,994)`, unfocused. CSS1512×949, DPR2, PNG3024×1898, explicit built-in dark and no active skin. Final console: zero errors, one development Electron CSP warning. All25 tracked final-run processes stopped; `remaining:[]`. Both preceding probes were also stopped completely.

Only these inspected screenshots are published transactionally:

- `bottom-menu-final.png`: nested panes, lower-pane menu, all first-row controls below the titlebar.
- `source-action-caret-final.png`: protected note explicitly in Source, another note in Live Preview, visible high-contrast caret.

`proof.json` contains the actual UI results, raw saved-source checks, clipboard-sink evidence, geometry and cleanup metadata. Temporary scripts/logs: `/tmp/tocktutor-split-desktop-20260921/`.

## Limits and Remaining Work

- Direct HTTP navigation/reload of a deep TockTutor URL returned404. The restoration proof reloads the application entry root, then opens TockTutor; do not claim deep-link reload works.
- One initial protected-action harness edited the shared note before navigating its peer, which legitimately saved it. The corrected test edits the other note after navigation and verifies its unsaved state before and after the action.
- Menu completion, linked views/Properties, default-app dispatch, recoverable merge and final parity remain pending. All-note source-preserving Live Preview and external-image rendering are separately being investigated by the launcher session.
- No OS default-app/clipboard side effects, user profile changes, Git staging, commits or pushes were performed in this worktree.
