# Wikilink Rename Verification

## Result

`tockteam-yoam.21` is verified. Renaming a note now preserves references through the existing bounded inspection planner and Runtime rewrite/recovery pipeline. No second resolver, event source, runtime, dependency, or mutation authority was introduced.

This resolves the wikilink defect discovered in the preceding linked-view Desktop gate. It does **not** establish complete note-menu parity. Linked-view issues `.13`/`.17` have their scoped evidence, but their dependency chain `.2` → `.4` → `.5` remains open; closure is not forced.

## Implementation and Review

- Uses complete pre/post-move document inventories and the existing resolver. Preserves valid authored alias spellings, qualifies references when resolution would change, and supports explicit extensions when Markdown would capture a Canvas/Base basename.
- Encodes filename delimiters once while preserving display aliases and query/fragment suffixes. Previously unresolved or ambiguous references are not guessed.
- Retains bounded, cancellable scanning and pagination consistency, including non-Markdown resolution metadata. An unpreservable resolved target cannot silently produce a successful rewrite.
- Preserves fenced/inline code, frontmatter, literal Markdown titles and protected HTML. Quoted titles handle parentheses, escaping and LF/CRLF. HTML stacks retain region precedence and nearest matching closure; name counts avoid repeated ancestor searches.
- Existing revision validation, recovery snapshots, physical-alias conflict handling, and Runtime mutation ownership remain intact.

Independent review found and drove corrections for collision capture, alias changes, incomplete inventories, encoding, malformed scanner work, title literals, and nested HTML. The final retained-review recheck found no issues; its exact output is copied as `review.md`. Earlier reviews and RED logs remain in the session artifacts and `/tmp/wikilink-parent-*.txt`. Static reviews are not described as executed tests.

## Parent Verification

```sh
pnpm --dir plugins/tocktutor/packages/tockbot-note-vault exec node --test test/inspection.test.js
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime exec node --test tests/loader-composition.test.ts
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/vault-events-runtime.test.ts
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime typecheck
pnpm run build:tocktutor
pnpm run build
node scripts/tocktutor-build-manifest.mjs --check
node scripts/stage-dsh.mjs --quick
git diff --check
```

Passed: **48 planner tests, 93 real Runtime loader tests, 147 route/event tests**, typecheck, builds, manifest verification, quick staging, and diff checks. All nine staged inspection copies have exactly the source SHA-256 recorded in `proof.json`.

Final `pnpm test`: **1363 passed, 5 failed, 18 skipped**. The five failures are the existing sandbox/process `EPERM` checks in marketplace and trusted-Raycast tests. The full root suite is not green. No Nix execution, installed smoke, deployment, Git staging, commit, or push was performed.

## Clean Desktop Proof

Fresh isolated run `9717e68c-f756-4f49-bb2f-f3860abe62d9`, root PID32163:

1. Opened `Notes/中文 Source.md` and source-bound Backlinks and Properties.
2. Used the actual Rename Note dialog to rename it to `Notes/Renamed 中文#Source.md` while a different `Other/Renamed 中文#Source.md` already existed.
3. Verified source group/tab IDs remained unchanged and both linked panes tracked the renamed path. All five linked mentions refreshed, including the encoded reference, embed, frontmatter alias, and root referrer.
4. Disk assertions verified the old path was absent; CRLF/frontmatter stayed intact; inbound references were rewritten exactly; the alias spelling, quoted title and nested HTML were unchanged; the other same-basename note was untouched. The existing Markdown rewrite normalizes `[Sibling](Sibling.md)` to `[Sibling](./Sibling.md)`—rename is not byte-identical.
5. Navigated from Backlinks to the root referrer, then through its bound Outgoing Links view to the correct renamed note—not the same-basename note in Other—and retained the same source tab.
6. Reloaded the **application root**, selected TockTutor, and verified exact session/layout/group/tab/binding state restoration. This is not a direct deep-link HTTP reload claim.

Geometry: **1512 × 949 CSS pixels, DPR2, 3024 × 1898 PNG**. Explicit built-in dark theme; both root/body skin attributes absent. The restored source viewport is partly scrolled; linked Properties and all five Backlink records are visible. This is a TockTutor evidence capture, not a newly captured side-by-side Obsidian comparison.

Runtime console: **0 errors**, one known Electron development insecure-CSP warning. The warning was not suppressed.

## Cleanup and Superseded Attempts

- Clean run: all18 recorded processes stopped; `remaining:[]`.
- Earlier run `49e76333-5266-45a5-b441-03460b369e0a`, PID30004: also all18 stopped. Rename, disk checks and bound navigation passed, but two initial locator attempts used visible text instead of the actual accessible label. An attempted HTTP reload of `/tocktutor` returned the already-known unsupported deep-link404. These failed attempts do not count as restoration proof; the fresh application-root run above supersedes them.
- Extended-display inspection probe PID29946 also stopped with no remaining processes.
- Playwright sessions detached. No user browser/profile/app, cursor, clipboard or Keychain was controlled. The guard supplied mock Keychain and isolated data roots; native clipboard writes were intercepted and external effects remained denied.
- Direct Live Preview pointer navigation was not established by the earlier exploratory clicks. Accepted navigation evidence uses the genuine linked Backlinks/Outgoing Links controls. No native OS default-app or clipboard acceptance is claimed.

Only the inspected allowlisted `renamed-restored.png` is published. Report, proof, review, logs and screenshot are installed together by an atomic directory rename.
