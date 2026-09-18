# Bundled Extensions Installed Verification

**Accepted code checkpoint:** `24960839`. Fresh macOS arm64 installed-app verification passed for the three bundled extensions. This is an ad-hoc-signed internal installation, not notarized/public distribution or Windows acceptance.

## Actual App Results

- Fresh bootstrap installed and enabled Google Translate, Kaomoji Search, and Can I Use after their exact reviewed digest admission. The proof inspected their actual main-owned trust projections and installed identities.
- Normal launcher search opened each command without an approval view. Cold and warm entry required rendered source content, not the permanent search/list shell or preferences alone.
- Translate completed required preferences and reached its populated language selector, empty results, and enabled Actions trigger. Because proof mode intentionally denies selected-text access, the harness entered **empty manual input** to clear only the expected denial, then required an error-free loaded view. No translation request was sent.
- Kaomoji displayed its actual 64-row bounded projection. Can I Use retained the exact feature search, 14-browser detail view, preference persistence, query-preserving back navigation, warm entry, and denied external-browser effect checks.
- The Extensions view disabled Kaomoji. After complete teardown, a second app process reused the same isolated profile. Translate and Can I Use actually opened again; Kaomoji remained installed but disabled, with management/setup discovery rather than a runnable command.

Both Playwright/CDP sessions verified **1512 × 949 CSS pixels, DPR 2, dark theme, and no skin**, initially and finally. No screenshots were captured. Both sessions had zero active UI page/console errors and zero shutdown JavaScript errors. Each separately recorded one expected `ERR_INCOMPLETE_CHUNKED_ENCODING` console message while the app's streaming connection shut down; this is not reported as zero console output across teardown.

App PIDs **17626** and **18306** remained unfocused. Mock keychain and isolated userdata were used. Both app-tree checks and the outer watchdog's process inventory recorded no residue. The installed copy, successful smoke root, and all eight owned verification cache roots were removed. User profiles and Keychain were untouched.

## Checks

| Check | Result |
| --- | --- |
| Fresh installed first-use/restart gate at `24960839` | Passed |
| `node --test --test-concurrency=1 tests/*.test.ts` | 1,296 passed, 14 conditional skips |
| `node --test tests/trusted-raycast-installed-readiness.test.ts tests/trusted-raycast-can-i-use-package.test.ts tests/launcher-installed-first-use.test.ts` | 19 passed |
| `pnpm run typecheck` and source/package builds | Passed |
| Workbench component suite | 425 passed |
| WebClip suite | 60 passed |
| Post-smoke Desktop and Workbench package-boundary tests, each run from its owning package | 3 and 5 passed |

The actual installed command was run by `/tmp/tockteam-eight/run-bundled-installed.mjs`, which launched:

```sh
node scripts/launcher-installed-smoke.mjs \
  --tockteam-launcher-installed-smoke \
  --tockteam-launcher-installed-first-use-smoke
```

It supplied an isolated `.noindex` cache root and private report paths, recorded the root PID, enforced a 15-minute outer deadline, and verified descendant cleanup in `finally`. No installed checks ran concurrently.

## Review and Evidence

Independent review caught and corrected false-positive shell checks, discovery-only restart checks, and a Google predicate that did not match the real renderer. Real-renderer positive/error fixtures now protect readiness. Actual execution additionally corrected pnpm's hashed global package lookup, CommonJS loading, expected selected-text denial recovery, and separation of active versus shutdown error evidence.

The [published proof](bundled-extensions-installed-2026-09-16/proof.json) contains the fresh build identity, all three trust states, both launches, focus checkpoints, geometry, error phases, and app cleanup. The same allowlisted directory retains outer cleanup, cache removal, regression evidence, and post-smoke package checks. Raw failure diagnostics were not published because they contain temporary runtime capability URLs.

The earlier `9c7aaaa2` run passed its flows but had mutable error arrays; it is not the accepted zero-active-error evidence. The final proof above supersedes it.

`tockteam-snz` is verified on the supported macOS runtime. Search-index isolation (`bon`) and Windows process ownership/workflow integration (`fsq`) remain incomplete; historical Windows causation is still unproven. Nothing was pushed.
