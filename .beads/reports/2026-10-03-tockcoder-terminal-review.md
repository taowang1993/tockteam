TockCoder review — 2026-10-03 (Asia/Shanghai)

There are **4 confirmed findings: 3 terminal bugs and 1 documentation error. All four are fixed and verified.** Beads task: `tockteam-tj4w`.

Read the TockCoder guide and reviewed the first-party navigation, sidebar, Files/Review, workspace/Git authority, composer/history/comment bridge, terminal, pinned summary, preferences and composition code, together with the consumed Better Sidebar Host adapter. Applied all three review perspectives: code simplification, security and hardening, and performance optimization. The fixes remain in the existing DSH Profile/Loader composition and do not alter the pinned upstream source or agent-owned terminal protocol.

1. **P1 — Pasted JSON could terminate or park a terminal.** Impact: a pasted `{"type":"close"}`, `{"type":"park"}` or resize-shaped JSON string was interpreted as a Host control instead of shell input, potentially interrupting work. Affected paths: [terminal-socket.ts](/Users/taowang/projects/tockteam/plugins/panel-controls/src/terminal/terminal-socket.ts) and [better-sidebar-upstream-adapter.mjs](/Users/taowang/projects/tockteam/scripts/better-sidebar-upstream-adapter.mjs). **Fixed:** UI-tab input now uses binary UTF-8 frames; only text frames are parsed for explicit controls. **Verified:** the regression failed on the original close-shaped paste, then passed for all three shapes, Unicode, line endings and Ctrl-C. The real staged Web consumer preserved all four pasted lines in a file written by its actual PTY reader.

2. **P2 — A closed connection could spawn an orphaned shell after session lookup.** Impact: persisted-session metadata can resolve after its socket closes; the Host previously spawned a PTY and installed its close listener too late, leaving a shell without a view or cleanup timer. Affected path: [better-sidebar-upstream-adapter.mjs](/Users/taowang/projects/tockteam/scripts/better-sidebar-upstream-adapter.mjs). **Fixed:** verify that the socket is still open immediately before creating/reusing the UI-tab PTY. **Verified:** a real loopback connection is closed while persisted-session lookup is suspended, then lookup is resolved. The test failed with an orphaned handle before the fix and now creates no shell.

3. **P2 — Tab closure could wait for the reconnect timeout.** Impact: after an explicit close scheduled termination with zero delay, the ensuing socket-close handler could cancel it and schedule the reconnect grace instead. The UI reported no running shell while its process and quota remained alive. Affected path: [better-sidebar-upstream-adapter.mjs](/Users/taowang/projects/tockteam/scripts/better-sidebar-upstream-adapter.mjs). **Fixed:** remember the explicit close request and skip the bare-disconnect timer for that connection. Park and ordinary reconnect behavior remain available. **Verified:** the regression failed with a second `scheduleClose(..., 1000)` and now retains the immediate close. Before the fix, the actual shell survived the five-second tab-close check; after rebuilding, the shell was already stopped at the first process check following the same UI action.

4. **P3 — The guide gave a nonexistent Web entry point.** Impact: following the documented Web `/tockcoder` address returned HTTP 404 in the pinned runtime. Affected path: [tockcoder.md](/Users/taowang/projects/tockteam/.agents/references/tockcoder.md). **Fixed:** distinguish Desktop's `/tockcoder` route and legacy canonicalization from Web's `/` HTTP entry point, and describe the terminal input/control directions, delayed-lookup guard and close behavior. **Verified:** the real Web entry at `/` loads the workspace and terminal; the separate `/tockcoder` probe returned 404. No additional Web routing system was introduced.

The new [terminal-input.test.mjs](/Users/taowang/projects/tockteam/tests/terminal-input.test.mjs) bundles the consumed adapted Host and uses the actual browser socket class over loopback WebSockets. Its PTY is controlled so assertions can distinguish shell bytes from lifecycle controls. [terminal-protocol.test.ts](/Users/taowang/projects/tockteam/tests/terminal-protocol.test.ts) also verifies LF/CRLF adaptation and that the agent-terminal implementation remains byte-for-byte unchanged.

All three implementation findings were reproduced before their production fixes. Exact red/green regression commands:

```sh
node --test tests/terminal-input.test.mjs
node --test --test-name-pattern 'disconnect during session lookup' tests/terminal-input.test.mjs
node --test tests/terminal-input.test.mjs tests/terminal-protocol.test.ts
```

Final focused check: **137 passed, 0 failed**.

```sh
node --test --test-concurrency=4 tests/tockcoder-navigation.test.ts tests/sidebar*.test.ts tests/workspace*.test.ts tests/review*.test.ts tests/composer*.test.ts tests/input-history.test.ts tests/terminal*.test.ts tests/pinned-summary*.test.ts tests/right-panel-layout.test.ts tests/terminal-input.test.mjs tests/better-sidebar-*.test.mjs
```

Other verification: `pnpm run typecheck` passed; final `pnpm test` passed **1,794 tests with 18 skips and 0 failures**; `pnpm run build` and `node scripts/stage-dsh.mjs --quick` passed. `git diff --check` passed. The `.test.mjs` Host checks are run explicitly because the root test glob includes only `.test.ts`.

The final consumer proof uses the actual staged DSH **0.1.2-rc.1** Web profile and adapted Better Sidebar **0.18.0**, an isolated home/data root, and a disposable directory registered through real Host workspace/session APIs. Browser interaction opened the actual terminal dock, pasted into xterm, collapsed/expanded it to exercise resizing, and closed the tab. The shell reader wrote the exact expected input; all eight paste/Enter frames were binary. No model request or paid submission was used. The screenshot shows a terminal readback of that verified file in an empty session, Standard Mode and Workspace Write.

The allowlisted [screenshot](/Users/taowang/projects/tockteam/.beads/reports/2026-10-03-tockcoder-terminal-audit/terminal-paste.png), [proof](/Users/taowang/projects/tockteam/.beads/reports/2026-10-03-tockcoder-terminal-audit/proof.json) and [verification results](/Users/taowang/projects/tockteam/.beads/reports/2026-10-03-tockcoder-terminal-audit/verification.txt) were published together only after verifying **1512 × 949 CSS pixels, 2× device scale and 3024 × 1898 PNG pixels**, route `/`, terminal visibility, built-in dark appearance and no active skin. The current page console and capture window recorded zero errors and warnings. The deliberate earlier 404 probe is separate from that successful capture.

Cleanup is recorded in the proof: final DSH root PID `92336`, Playwright daemon/browser root `93997` and all five browser processes stopped; real shell PID `94153` stopped on explicit tab close; the Web listener refused connections afterward. The final runtime used `--no-open`. Earlier diagnostic launches invoked the default browser opener; native tab inspection was unavailable because Computer Use permissions were pending. No existing system browser process was terminated.

No unresolved confirmed findings remain in this audit's changes. Desktop/CDP component capture, native Electron and installed smokes were not run: this change does not touch Electron, preload, IPC or packaging, and the real shared Host/client terminal was exercised through Web. The separate previous Coder run (`tockteam-n04z`) is still handling its Review-panel findings in its own checkout; its implementation and fixture changes are not included here. Existing Launcher/Tutor work and other uncommitted files are excluded from this commit. Restart Electron to load the rebuilt terminal behavior.
