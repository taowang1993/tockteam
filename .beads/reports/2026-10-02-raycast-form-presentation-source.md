# Form Descriptions and Separators — Source Checkpoint

`tockteam-qwzg.8.3.7` remains **in progress**: API/Manager/DOM source checks pass; broader root/build/stage and guarded real Desktop/screenshots remain pending behind the peer's newly requested TockTutor titlebar-divider slot. Do not call this completed UI or Tinycast compatibility proof.

## Scope

Independently implement SDK2.0.3 `Form.Description` (optional string title, required plain string text) and `Form.Separator` / deprecated `FormSeparator`. Public declarations are inert reference-only at `/tmp/tockteam-raycast-scope.5lIcfC/raycast-api-2.0.3.d.ts`: DescriptionProps2105–2118, separator8397–8413 and legacy4599. Tinycast documentation is a behavior reference, not implementation material.

The SDK adapter emits only finite presentation props; extra IDs/functions/children never become registered fields/actions. Manager admits only exact description title/text and empty divider props/children, preserving existing8192-node/32-depth/256KiB text/1MiB frame bounds. Both title/text reuse the existing16384-character string validator. Raw counterfeit handles, malformed props and executable child projections reject before rendering. No field kind/event/IPC/native effect or storage path was added.

The renderer traverses declared Form rows in order, excluding action slots, nested Forms and field-option children. Native `<hr>` and textContent-based description rows use existing semantic label/body/spacing/border styles. Literal HTML/markdown stays literal, optional/empty/long text is retained, and read-only rows never enter the value/cache or focus registries. A second presentation-only Form submits{}; a real field whose ID equals a description title remains separately owned. Existing basic/choice/date controls, callbacks, queued edits and accepted persistence are reused.

## Confirmed Findings

**1 confirmed development finding, fixed with a public regression; no completed Desktop or new shipped-product bug claim.**

1. **Medium — Replacing an informational sibling could drop an unchanged field's focus.** Impact: the first description-update check kept the same edited input/caret but `document.activeElement` became BODY. Path: `src/user-raycast-renderer.ts` shared `reorder()`. A minimal JSDOM probe proved inserting a new description preserved focus but moving the existing input before the soon-to-be-removed old description lost it; input identity stayed equal and disabled=false. Fixed at the shared reconciler by retiring obsolete siblings before ordered insertion. A Set avoids repeated membership scans when many read-only rows are present. The public real API + Manager + DOM check now preserves field identity/focus/caret through text updates, and all97 Form checks pass. Deliberate actual field reordering remains a separate behavior, not claimed by this focused repair.

Separate verification corrections, not product findings: submission tests parse visible JSON and assert exact key/value semantics rather than incidental property order; field layout-effect updates can legitimately reinsert Map entries. One maximum-length first-party fixture had a missing object brace and failed with `Extension exited`; corrected the fixture and added `node:vm.Script` parsing before allocating/launching test runtimes. The same16384-character valid boundary then passed. No production revision/callback/storage/protocol guard or expected typed value was weakened.

## Exact Verification

```sh
# RED0/1: missing SDK presentation members prevent visible Form.
node --test --test-reporter=tap tests/user-raycast-form-presentation.test.ts
# New public main + empty/multi-Form + ceiling +12 admission abuse cases:16/16.
# Final exact frozen source:97/97,0 failed/skipped.
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-form*.test.ts
#482 passed,6 optional skipped,0 failed before equivalent Set membership optimization.
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast*.test.ts tests/trusted-raycast*.test.ts tests/launcher-ipc.test.ts tests/launcher-preload-bridge.test.ts tests/launcher-window*.test.ts
pnpm run typecheck
react-doctor . --verbose --diff
```

Final Form97/97 and typecheck were repeated after the Set membership change. React Doctor exited0 and scored69/100 on its selected28 changed files; its one high-complexity warning is the unchanged TockTutor `src/client/plugin.tsx:1012`, outside this source scope. No Native warning appeared; no measured baseline-score comparison is claimed. No linter-directed unrelated edit was made.

Only three owned production files and one new test changed; all other baseline tracked/unowned/protected paths remain hash-identical. First-party tests build only in disposable `/tmp`, prohibit network/native effects and assert full fake process-group teardown/ESRCH. No Desktop/browser/server, root build/stage, profile/credential/Keychain, third-party command, worktree or push occurred in this checkpoint. Diagnostic logs, the focused DOM probe, protection baseline and frozen source hashes are under `/tmp/tockteam-form-presentation.iOGuds`.

## Pending Proof

After the peer's authoritative full handback: verify frozen source/tests and fresh protected baseline, repeat scoped/root/typecheck/build/quickstage, run the first-party real guarded Desktop description/divider/default/edit/typed-submit/close/reopen flow, check narrow wrapping/focus/contrast/content/error evidence, capture only allowlisted1512×949CSS@2→3024×1898 dark/no-skin PNGs, publish transactionally and prove all owned trees stopped. Update the TockLauncher reference and close only `.8.3.7` after those checks. Date full-day/natural-language/native-popup paths, file fields, richer pickers, shared SDK and overall `.8` remain open.
