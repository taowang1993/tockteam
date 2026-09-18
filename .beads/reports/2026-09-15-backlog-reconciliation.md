# Backlog Reconciliation

Audited source: `c7e630e1ce20143acaa93414c8dfd5b7bb5a8760` on `main`. Scope: the six open and four in-progress issues identified by the user. No application source changes, new browser/app launches, provider calls, or Windows diagnostic captures were authorized or performed by the parent. Beads tracking: `tockteam-6pj`.

## Closed

| Issue | Evidence and Scope |
| --- | --- |
| `tockteam-87d` — Windows Cleanup Tool Paths | Already fixed in `d36e70a4`: `scripts/process-cleanup.mjs:14–18` resolves tools under `System32`; PowerShell, taskkill, and tasklist use it. Parent executed the actual private resolver with Windows path semantics: three correct tool paths and rejection of blank, relative, and missing roots. Fresh cleanup tests passed 13/13 locally. Existing exact-head Windows CI `34930192098`, job `104256613057`, also passed its real child-cleanup test. The separate after-root-exit ownership problem remains in `fsq`; it is not the original path defect. The resolver-specific check was disposable, not a newly committed regression. |
| `tockteam-3l3` — Raycast Featured Extensions | The approved scope is implemented: Kaomoji and Can I Use supported within their admitted macOS contracts; Mole explicitly excluded and denied. Dated membership/scope evidence, pinned bytes, finite integration, and accepted source-Electron/installed proof exist. Parent reviewed the final sections of the Can I Use admission report and child closure reasons, rather than stale intermediate notes. Fresh focused tests: 218 passed, one opt-in runtime test skipped. New auto-bootstrap acceptance is separately tracked by `snz`; platform discovery and lifecycle residuals remain `dve`/`fsq`. No new native run or notarized/public-release claim. |

The Featured epic did not require a notarized public release or Windows runtime support. Requiring those now, or automatically invalidating all scoped historical proof because unrelated commits landed, would expand its acceptance criteria.

## Remain Open

| Issue | Current Finding | Next Necessary Work |
| --- | --- | --- |
| `tockteam-ng3` — Editor and Base Gaps | All six original gaps remain: incoming Source selection is not applied; restoration consumes only the first 200-entry tree page; Base rejects `.markdown`; failed uncontrolled cell edits do not reset visible values; inserting before a frontmatter delimiter at EOF corrupts the prior line; quoted scalars are coerced. | Fix each with a focused regression, prioritizing frontmatter corruption and value preservation. |
| `tockteam-q6h` — Notes Search Compatibility | Both original failures remain. Arguments check `query.trim()` only for emptiness but return the original padded query; the runtime trims it and the result validator requires exact equality. The alias also rejects Canvas/Base matches in an otherwise valid mixed page. | Normalize before dispatch and deliberately align accepted document kinds with the provider before pagination. |
| `tockteam-g82` — Web Viewer and Reader Contracts | Empty-tab activation/close has no frame-clearing branch. External navigation starts before `dom-ready`; restoration can replace it, or completion can encounter a null frame ID. Configurable Host Reader maxima still exceed fixed client parser caps. | Add mounted timing/empty-frame tests and Host-to-client maximum-config round trips, then repair the corresponding behavior. |
| `tockteam-dve` — Platform-Aware Catalog | Catalog runnable state depends on installation/trust, while the manager separately rejects non-macOS at invocation. | Project finite platform/runtime availability into discovery and test approved-but-unavailable commands. |
| `tockteam-fsq` — Trusted State and Descendant Lifecycle | Translate state still uses unbounded JSON loading and lacks Kaomoji's validation. Windows normal root exit finishes without the POSIX-style descendant drain; cancellation taskkill is not ownership after root exit. | Bound legacy-compatible state and establish a proven Windows descendant-ownership design. |
| `tockteam-1s5` — Notion-Like Search | Most implementation and qualified provider/Desktop evidence exist. The old missing-provider and cold-focus notes are stale; isolated focus tests now pass. However exact-match navigation still cannot apply the requested CodeMirror range, overlapping `ng3`. | Fix and verify incoming Source selection/scroll, then reconcile the search acceptance again. Do not treat the separate Windows historical-cause investigation as an invented new search criterion. |
| `tockteam-snz` — Automatic Bundled Extensions | Implemented in `main.ts:2357–2374` and `trusted-raycast-trust.ts:200–223`; unit checks cover install/disablement. But the retained installed first-use proof at `156478b5` predates auto-enable `22cf9ef0` and explicitly exercises the old approval flow for Can I Use. | Verify an isolated cold packaged launch auto-enables all available bundled extensions before discovery, preserves explicit disablement, handles failure safely, and cleans up. This is an evidence gap, not a demonstrated missing implementation. |
| `tockteam-bon` — Windows Search Startup Stall | Reproduced recovery defects and CI temporary-folder mitigation are implemented. The original cancellation remains unattributed; native constructor/wait callbacks and disposal are still awaited in-process without a product isolation guarantee. | Remains paused pending a new justified discriminator and explicit capture approval; no random reruns. |

## Concrete Source and Reproduction Evidence

- **Source selection:** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx:4528–4540` passes only outgoing `onSelectionChange`; `src/source-editor.tsx` has no incoming selection request. Focusing `.cm-content` is not applying the match range.
- **Tree restoration:** Workbench `src/route.tsx` uses `TREE_LIMIT = 200` and a single startup tree page, then uses those entries when restoring persisted paths. Runtime pagination support does not make the route consume later pages.
- **Base Markdown variants:** Workbench `src/base-query.ts:167–177` rejects paths not ending in `.md`.
- **Cell rollback:** Workbench `src/base-executable-view.tsx:147–160` uses `defaultValue` with a revision/value key and fires a void edit callback; failed writes retaining the same revision/value do not reset the uncontrolled input.
- **Frontmatter:** Parent invoked current compiled `dist/properties.js`. Adding `other: two` to `---\nvalue: one\n---` returned `---\nvalue: oneother: two\n\n---`. Parsing quoted `"true"` returned boolean `true`, type `checkbox`. Relevant source: `properties.ts:75–86,138–148`.
- **Notes queries:** `plugins/tocktutor/packages/tockteam-note-vault-tools/src/index.ts:541–573` returns `query: value.query`; `:623–624` compares the raw response query exactly. Runtime normalization occurs in `plugins/tocktutor/packages/tockbot-note-vault/inspection.js:4161`. Parent executed the actual compiled argument/result functions in a VM with boundary helpers: padded input remained padded, and both a normalized response and a Canvas result were rejected.
- **Web Viewer:** `plugins/tocktutor/packages/tockbot-web-clip/src/client.tsx:179–200,247–265` starts external navigation before readiness and has no empty-tab load/clear branch. `src/client-api.ts:28–40` fixes output/title/warning caps at 200,000/200/200 characters and eight warnings, while Host configuration permits larger values.
- **Catalog:** `src/trusted-raycast-catalog.ts:30–42`, `src/trusted-raycast-manager.ts:62–67`, and `src/main.ts:2371–2375` use inconsistent discovery/invocation availability.
- **State/ownership:** `src/trusted-raycast-compat-utils.ts:26–38` and `src/launcher-workflow-process.ts:398–400` retain the two `fsq` gaps.
- **Native lifetime:** `plugins/tocktutor/packages/tockbot-note-runtime/src/index.ts:123–140,273–280` awaits native callbacks and reconciliation. `.github/workflows/ci.yml:70–76` changes only Windows test storage placement.

## Parent Verification

```sh
node --test tests/process-cleanup.test.ts
# 13 passed

node --test tests/trusted-raycast-can-i-use*.test.ts \
  tests/trusted-raycast-can-i-use*.test.mjs \
  tests/trusted-raycast-mole-denial.test.ts \
  tests/trusted-raycast-kaomoji*.test.ts \
  tests/trusted-raycast-first-use.test.ts \
  tests/trusted-raycast-install-recovery.test.ts
# 218 passed, 1 opt-in runtime test skipped

pnpm --dir plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run \
  tests/route-panel-controls.test.tsx tests/route-editor-readiness.test.tsx \
  --environment jsdom -t 'preserves search focus lifecycle|readiness'
# 7 passed, 49 excluded by the filter; readiness file was skipped
```

Logs: `/tmp/tockteam-backlog-{cleanup,feature,focus}-tests.log`. The parent also inspected the existing exact-head Windows CI log at `/tmp/tockteam-backlog-windows-ci.log`; no new CI run was triggered. Earlier full-head checks remain separately recorded: root 1,281 passed/14 skipped, build/typechecks, and six successful CI jobs. They do not prove the uncovered cases above.

## Retained Acceptance Evidence

- [Featured scope decision](2026-09-10-raycast-featured-scope.md): intermediate implementation status is historical; the final Can I Use child closure supersedes it.
- [Can I Use admission and final installed result](2026-09-11-can-i-use-electron-admission-proof.md).
- [Old explicit-approval installed first-use proof](2026-09-11-extension-first-use-installed-verification.md): not proof of the later auto-enable policy.
- [Search cold-focus repair and bounded browser proof](2026-09-12-search-lifecycle-fixes.md).
- [Search provider evidence](tocktutor-search-provider-verification/verification.json): qualified staged development evidence, not notarized installed-release proof.
- [Native recovery investigation](2026-09-14-search-native-recovery.md).

## Audit Limits and Parent Corrections

Three read-only scouts were launched in workflow `0c23ead1-1681-4f7f-9167-bb9697e041bf`. Launcher completed; feature/tutor workers hit their 1,800,000 ms limits. Clean source was verified, and both were resumed only to finalize already gathered evidence. Their reports are supporting material, not closure authority. The tutor worker reported a build despite the no-build task boundary; no tracked changes were present afterward, and its reported test/build totals are not used for parent closure claims.

Parent corrections to recovered reports:

1. Padded Notes query normalization is **not fixed**, proved against current compiled code.
2. Existing empty-tab reducer behavior does **not** fix the stale webview; the actual activation path lacks clearing.
3. Featured release/notarization and new Windows support are **not** retroactive parent requirements.
4. Search's accepted historical provider evidence exists; a concrete incoming-selection defect, not an invented current-HEAD release gate, keeps that epic open.
5. Windows cleanup path resolution was checked directly and against existing real Windows CI; root-exit ownership remains the distinct `fsq` issue.

All three review perspectives—simplification, security/hardening, and performance—were applied to the scoped findings. No new native/browser/provider acceptance was claimed. The audit closes two original issues and leaves eight with specific implementation or evidence gaps.
