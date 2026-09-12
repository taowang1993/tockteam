# TockLauncher first-screen Playwright proof

## Run identity

- Date: 2026-09-06
- Reviewed HEAD: `b6ca8f35d6b40c4db56c0a699d4e9117553c9336`
- Surface: compiled Desktop Electron app (`dist/launcher.html`) over a real CDP endpoint
- Scope: visual/user-flow proof only; no application source files changed

## Launch and profile handling

A temporary harness launched the compiled app with `ensureElectronInstalled()` and the same fixture switches used by the bounded Electron smoke. It used a dedicated `--user-data-dir` (`/var/folders/.../tockteam-playwright-user-Aes6PP`) and imported `scripts/process-cleanup.mjs` to stop the detached Electron process tree.

```sh
node /tmp/tockteam-playwright-proof-harness.mjs > /tmp/tockteam-playwright-proof2.log 2>&1 &
# harness output: {"port":64325,"pid":52663,"userData":"..."}
playwright-cli -s=launcher-proof3 attach --cdp=http://127.0.0.1:64325
```

The fixture discovery root contained an application entry matching the app-owned discovery fixture (`TockTeam Fixture.app`). Through the real TockCoder workbench bridge, the run configured the fixture folder, enabled the discovery providers, enabled search history, and set `window.hideWindowOn` to `[]` so CDP tab switching did not intentionally blur-hide the launcher. No page or bridge was mocked.

## Playwright commands and evidence

The attached browser was exercised with Playwright CLI commands (the `e*` references came from CLI snapshots):

```sh
playwright-cli -s=launcher-proof3 tab-select 1
playwright-cli -s=launcher-proof3 --raw snapshot > /tmp/tockteam-playwright-sections-full.yml
playwright-cli -s=launcher-proof3 screenshot --filename=/tmp/tockteam-playwright-sections-full.png
playwright-cli -s=launcher-proof3 fill e7 TockTutor
playwright-cli -s=launcher-proof3 press Enter
# workbench route became /tocktutor
playwright-cli -s=launcher-proof3 fill e7 ''
playwright-cli -s=launcher-proof3 press ArrowDown
playwright-cli -s=launcher-proof3 --raw eval 'JSON.stringify({activeId:document.activeElement?.id,activeDescendant:document.getElementById("launcher-search")?.getAttribute("aria-activedescendant")})'
playwright-cli -s=launcher-proof3 press End
playwright-cli -s=launcher-proof3 --raw eval 'JSON.stringify({scrollTop:document.querySelector("#launcher-results")?.scrollTop,scrollHeight:document.querySelector("#launcher-results")?.scrollHeight,clientHeight:document.querySelector("#launcher-results")?.clientHeight})'
playwright-cli -s=launcher-proof3 screenshot --filename=/tmp/tockteam-playwright-bottom-final.png
```

After invoking TockCoder to create a second Recent item, the blank-query snapshot and screenshot showed the complete order. TockTutor was pinned through the selected-result action (`Meta+F`), then the blank-query view was captured again.

- Snapshot artifacts: `/tmp/tockteam-playwright-proof/sections-full.yml`, `search-final.yml`, and `pinned-recent-final.yml`.
- Screenshot artifacts: `/tmp/tockteam-playwright-proof/sections-full.png`, `search-final.png`, `pinned-recent-final.png`, and `bottom-final.png`, plus the opening and scrolled captures from the initial state.
- These artifacts were captured and visually inspected during this run; they are intentionally outside the repository. The committed artifact is this report.

## Observations

- **Opening structure:** the real page title was `TockLauncher` at `file:///Users/taowang/projects/worktrees/launcher/dist/launcher.html`; the initial snapshot had heading `TockLauncher`, an active `Search TockTeam` combobox, one selected option, and the `Commands` section.
- **Focus and selection:** after keyboard navigation, `document.activeElement.id` remained `launcher-search`, and `aria-activedescendant` pointed at the single selected result. The selected option changed with `ArrowDown` and `End`.
- **Scrolling:** the final `End` navigation selected `TockTeam Fixture` in `Applications`; `#launcher-results` reported `scrollTop=1471`, `scrollHeight=1848`, and `clientHeight=369`. The inspected bottom screenshot visibly showed the `APPLICATIONS` heading, highlighted fixture row, and footer controls.
- **Typed search and bridge action:** filling `TockTutor` produced one selected result. Pressing `Enter` opened the real workbench route `http://127.0.0.1:64336/tocktutor`, demonstrating the main-owned action path.
- **Pinned/Recent behavior:** after TockTutor was pinned and TockCoder was invoked, the empty-query snapshot had headings in exact order: `Pinned`, `Recent`, `Commands`, `Applications`. The top screenshot visibly showed TockTutor under Pinned and TockCoder under Recent; the full snapshot contained the Applications group and the bottom screenshot showed it.
- **Persistence:** the real workbench settings bridge returned `favorites: ["tockteam-route:tocktutor"]` and history `["TockCoder", "TockTutor"]` after the UI actions. No duplicate result IDs were observed.
- **Visual inspection:** the inspected 750x475 screenshots showed the title/search chrome, selected-row treatment, keyboard shortcut badges, section labels, and footer without clipping. The bottom capture confirmed the scrollable result surface reaches Applications.

An exploratory first profile attempted the favorite action before settings initialization and produced the expected refresh fallback. That profile was discarded. The final clean profile initialized settings through the real workbench bridge before exercising pinning; pin persistence and the complete section-order flow passed.

## Cleanup

```sh
playwright-cli -s=launcher-proof3 detach
kill -TERM "$(cat /tmp/tockteam-playwright-proof2.pid)"
curl --max-time 1 http://127.0.0.1:64325/json/list   # failed after cleanup: endpoint stopped
ps -axo pid,ppid,command | grep -E 'tockteam-playwright|/launcher/node_modules/.bin/electron|dist/main' | grep -v grep
rm -rf .playwright-cli
```

The final process-tree check found no worktree Electron/harness descendants, the CDP endpoint was stopped, and the Playwright CLI scratch directory was removed. No push was performed.
