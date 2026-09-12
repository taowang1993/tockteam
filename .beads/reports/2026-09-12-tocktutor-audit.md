# TockTutor Implementation Audit

## Outcome

Reviewed the TockTutor packages and Desktop integration against `.agents/references/tocktutor.md`. Corrected the reference, implemented the confirmed P1 findings and selected P2 root causes, added regressions, rebuilt tracked payloads, and verified the manifest. Remaining findings are explicitly tracked below; this is not a claim of exhaustive parity or defect-free code.

No dependency/version changes, profile migration, agent-loop changes, pushes, or user-data mutations were made. The concurrent TockLauncher session owned its separate changes. `.beads/interactions.jsonl` remains untouched by these commits.

## Fixes

| Area | Correction | Source Commits |
| --- | --- | --- |
| Native protocol dispatch | Respect resolution failures instead of falling back to an unintended vault; admit name-only note creation. | `24a60780` |
| Import and backup inventory | Drain ordinary cursor pages; continue rejecting incomplete scans and non-resumable truncation. | `e90d2364` |
| Reading and export projection | Keep unresolved private/external/local images inert; bound recursive rendering even when flattened embed graphs recreate cycles. | `5413220e` |
| Nested document creation | Create confined parent directories in the shared Runtime exclusive-create seam, covering imports, extracts, and organization proposals without another filesystem writer. | `a9aa420c` |
| Trash recovery | Include cancellation/vault checks after physical relocation in the existing rollback/recovery path. | `39f147cb` |
| Proposal admission | Bound previews for admitted 1 MiB content; roll back staging/audit changes when aggregate serialized capacity is exceeded. | `d825a872` |
| Editor ownership | Reject stale extraction/load completions, preserve edits during rename, refresh clean same-path external updates, and restrict Markdown-offset operations to Source mode. | `27f5a914` |
| Source comments | Skip empty CodeMirror mark ranges without losing comment state. | `27f5a914` |
| Backup compatibility | Admit inert `.weba`/`.ico` members and keep newly published backups within reviewed restore limits. | `4853c6ec` |
| Search and attachment providers | Use consistent alias-entry revisions for index/inspection while keeping canonical save revisions; align standalone/shared attachment maps. | `99a9ec97`, `9a6d2dc8` |
| Ordinary DSH proposals | Preserve independent TockDriver proposals across Pennivo replacement and reject permission revoke/restore races during source reads. | `5d702f9a` |
| Recording lifecycle | Reject late authorization/media results after unload, stop acquired tracks, and cancel a recorder returned after its owner ended. | `5696ef6d` |
| Web Clip defaults | Generate a timestamped Markdown filename under the configured clip folder instead of submitting the folder itself. | `c4370085` |
| Review visibility | Reload proposals/audit when conversation running/tool state changes; newly staged writes become visible without route changes. | `de7d3ffd` |
| Release payloads | Rebuilt `lib/`/`dist/` and regenerated the source/output manifest. | `7bee872d` |

The focused checks were run red before their corresponding fixes. The first alias-index correction exposed a second revision mismatch at the inspection read boundary; the follow-up corrected that boundary, and the native persistence/reopen regression now passes. The standalone attachment regression similarly exposed a second filesystem-adapter allowlist, also corrected.

## Reference Corrections

The reference now distinguishes:

- The exact `0.1.2-rc.1` DSH pin and existing component versions, without relying on stale overview text.
- Five nested slots, including separate vault actions and their exact current labels.
- Display-only `currentVault.displayPath` from native path authority.
- Search cache schema v2, mounted search intelligence/Quick Answer, and local fallback from vector-search claims.
- Wired Base view/search controls and loaded backlink counts from independent completeness guarantees.
- Unmounted Slides helpers, stored-but-unused retention/preferences, and bookmark/Source navigation limitations.
- Ordinary durable TockDriver proposals from child-bound provenance; approval identifiers from independently checked live-turn liveness; summary review from full-diff review.
- Actual first-level native export support from the shared renderer's recursive capability.
- Bounded backup scope, compatible publication limits, ephemeral retry evidence, and the precise ZIP checks currently implemented.

## Verification

The pinned local pnpm executable was used for repository operations. Ambient pnpm was not used to install repository dependencies.

| Check | Exact Command or Evidence | Result |
| --- | --- | --- |
| Nested build | `node node_modules/pnpm/bin/pnpm.mjs -C plugins/tocktutor run build` | Pass |
| Nested typecheck | `node node_modules/pnpm/bin/pnpm.mjs -C plugins/tocktutor run typecheck` | Pass |
| Nested tests, including parity and packed composition | `node node_modules/pnpm/bin/pnpm.mjs -C plugins/tocktutor run test` | Pass |
| Native index activation, disposal, alias persistence/reopen | `node node_modules/pnpm/bin/pnpm.mjs -C plugins/tocktutor/packages/tockbot-note-runtime run test:search-index` | 4/4 pass |
| Manifest regeneration | `node scripts/tocktutor-build-manifest.mjs --write` after successful build | Pass |
| Manifest verification | `node scripts/tocktutor-build-manifest.mjs --check` | Pass |
| Full root tests | `node node_modules/pnpm/bin/pnpm.mjs test` | 1,239 pass; 14 conditional skips; 0 failures |
| Root typecheck/build | Concurrent launcher owner's completed gates, followed by this session's final root typecheck | Pass; see linked launcher report |
| Whitespace/patch checks | `git diff --check` | Pass |

The first root test run found pre-existing staged Node 26 instead of the required Node 24. The launcher owner regenerated `.stage` using full staging with `DSH_DESKTOP_NODE_VERSION=24.20.0`; the subsequent full root run passed. Quick staging alone did not replace the stale Node executable.

React Doctor was run on changed React packages. Scores were Workbench 77, native adapter 68, Web Clip 77, and assistant 33. It reported existing large-component/control-flow and related-state warnings in Web Clip and assistant; no broad refactor was attempted. These are not clean-bill-of-health scores, and a historical score baseline was not established.

### Browser Evidence

[Component Screenshot](2026-09-12-tocktutor-audit-ui/audit-components.png) · [Proof and Cleanup](2026-09-12-tocktutor-audit-ui/proof.json)

A bounded headless Microsoft Edge session driven by `playwright-cli` exercised production Source/Reading/assistant components with mocked Host/session boundaries. It verified empty-comment Source rendering, inert unresolved image output, the complete clip destination, and proposal appearance after a completed turn. This is component behavior evidence, not a canonical product-parity screenshot or proof of the native clipping/recording flow.

- Route: `/tocktutor?audit=components`; Source plus inert Reading projection and staged-proposal controls.
- Geometry: 1512 × 949 CSS pixels at 2×; PNG independently checked at 3024 × 1898.
- Theme: explicit dark, `colorScheme === 'dark'`, no skin attribute.
- Runtime: zero page errors and zero requests to the test external-image origin.
- Screenshot publication used an allowlisted file and atomic directory rename after assertions.
- Final browser root/daemon and descendants: 4723, 4724, 4730–4732, 4734–4737; all verified stopped. Earlier verification browser trees were also stopped. No server was started and no foreground app/cursor control was used.
- Temporary harness: `/tmp/tocktutor-audit-ui.coz3QI`; command: `playwright-cli -s=tutor-audit run-code --filename=check.js`.

The [concurrent launcher audit](2026-09-12-tocklauncher-audit.md) also records a successful inactive real Electron/CDP proof against the rebuilt/staged app. Its root PID 1643 and all tracked descendants stopped; no page errors, no foreground switching. That proof is not coverage of every TockTutor native operation. Normal foreground/installed smoke, real microphone permission interaction, and full native import/export journeys were not run in this audit.

## Remaining Findings

| Beads Issue | Unfixed Scope |
| --- | --- |
| `tockteam-ng3` | Mounted Source selection/scroll requests; persisted tabs beyond first inventory page; `.markdown` Base inputs; failed Base cell rollback; frontmatter insertion at EOF; quoted scalar type preservation. |
| `tockteam-0g3` | Concurrent Pennivo initialization and protocol-failure retirement barriers; Quick Answer total-prompt budgeting and citation membership for omitted evidence. |
| `tockteam-g82` | Empty viewer-tab stale frames; external navigation versus readiness/restoration races; configurable Reader/title maxima versus browser parsers. |
| `tockteam-ocd` | Relative/nested native-export embeds; Bear asset-reference rewriting; recording memory before final size validation; ZIP local/central metadata consistency. |
| `tockteam-q6h` | Whitespace-normalized Notes search queries and the Markdown-only alias versus mixed Runtime document-result contract. |

Review depth was strongest at ownership, lifecycle, mutation/recovery, browser rendering, proposal, archive, and transport boundaries. Workbench formula/Canvas internals and oracle fixtures were sampled rather than exhaustively re-proven. No dependency vulnerability scan, cross-platform filesystem execution, or large-input recording-memory measurement was performed.
