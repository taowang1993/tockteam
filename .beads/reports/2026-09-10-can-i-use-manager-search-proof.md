# Can I Use Candidate and Manager Search Proof

## Scope and Result

The candidate assembler, actual manager/child search lifecycle, and visible count disclosure are verified on macOS with Node 24.20.0. This is **not production activation or distribution admission**. Public trust requests and native requests for Can I Use remain rejected; the public descriptor registry and Featured activation are unchanged. Mole remains excluded.

The internal candidate descriptor pins `0e23b06703ad85e91f9c6793c5de689204e9fe3bdb0fed3106a1324406bf3858`: 5,954,048 bytes, 101 tar members. Two assemblies are byte-identical. Tests compare unchanged source, gzip, legal files, and the private React 19.0.0 / reconciler 0.31.0 / scheduler 0.25.0 closure against the previously pinned inputs. No additional package is installed or admitted to the runtime.

Candidate creation currently uses macOS BSD tar. Positive assembly and assembly-dependent manager tests explicitly skip other platforms; cross-platform creation is not claimed. Distribution must not depend on this development-only assumption.

## Manager Guarantees

The real manager reads the held, pinned asset from its own extracted candidate directory and validates all six preferences before source import. Unsupported defaults, relative queries, and workspace paths fail without launching the source. Preview uses explicit `chrome 100`, not a defaults fallback.

Main searches all 581 entries before materializing at most 64. Published child rows must match the selected titles, slugs, order, and counts; root size, row/action counts, and absence of child action handles are checked. An invalid publication revokes prior search authority. Search consumes the current view handle, authenticates the stored registry handle, and sends only the main-prepared snapshot. Replay, wrong owner/generation, and closed-session requests are rejected. Close revokes the registry and stops the child process group.

The renderer reuses the existing status area and command identity layout. It displays visible/matching/total counts, including empty results. Support icons and operative details/browser actions remain subsequent work.

## Verification

Commands run from the repository, with `/opt/homebrew/opt/node@24/bin` prepended to `PATH`:

```sh
node --test --test-isolation=none tests/trusted-raycast-can-i-use-artifact.test.mjs
./node_modules/.bin/tsx --test --test-concurrency=4 tests/trusted-raycast-*.test.ts
./node_modules/.bin/tsc --noEmit
npx -y react-doctor@latest . --verbose --diff
git diff --check
```

- Candidate checks: **3 passed**.
- Trusted-Raycast regression suite: **217 tests, 210 passed, 7 skipped, 0 failed**. Skips are not verification of live services or native app flows.
- Typecheck and diff check passed.
- React Doctor exited successfully but selected no changed React project sources; it produced no score. This is not claimed as lint coverage of the root compatibility shim.
- Genuine failing checks preceded fixes: unknown Can I Use build descriptor (`/tmp/can-i-use-manager-red.txt`), surviving search authority after invalid publication (`/tmp/can-i-use-publication-red.txt`), and missing Can I Use renderer identity/counts (`/tmp/can-i-use-count-renderer-red.txt`).
- Final logs: `/tmp/can-i-use-candidate-final-tests.txt`, `/tmp/can-i-use-final-regressions.txt`, `/tmp/can-i-use-final-typecheck.txt`.

## Browser Evidence and Cleanup

Disposable harness: `/tmp/can-i-use-browser-proof.wTEmyk/harness.mts`. It connects the actual finite renderer to the actual manager and pinned child through a loopback-only, token-checked test bridge. It is not Electron or production IPC proof.

Playwright CLI 0.1.19, isolated headless Chromium session `can-i-use-root-proof`, verified:

- Initial 64 rows with “Showing 64 of 581 matches. Search covers all 581 features.”
- `textcontent` finds source index 500, `Node.textContent`, absent from the initial 64.
- One matching row and accurate 1/1/581 disclosure.
- Empty search results and accurate 0/0/581 disclosure.
- Light/dark screenshots with no horizontal overflow in the tested viewport.

Evidence: `browser-results.txt`, `browser-final-results.txt`, `initial-{light,dark}.png`, `searched-{light,dark}.png`, and `empty-{light,dark}.png` in that directory. Searched-dark and empty-light images were visually inspected. The harness supplies the app's system-font baseline.

Two setup attempts failed harmlessly: an unavailable `tsx` loader path (retried with Node 24 native TypeScript), and the CLI's missing default Chrome installation (retried with the same CLI's installed Chromium). Fixture-only requests for its initial Google icon and favicon returned 404; there were no application exceptions or missing Can I Use assets. These are not claimed as successful setup attempts.

Server PID 22725, trusted child/group 22746, browser daemon 22845 and all recorded descendants were stopped and independently checked absent. Failed launcher/daemon processes were also checked absent. `verified-cleanup.json` records all 12 checked PIDs; `cleanup.json` records child and process-group cleanup. No Electron app or installed smoke was started.

## Remaining Gates

Authenticated one-level details and Back, approved Can I Use links, support icons, preference setup/restart, installed asset/legal custody, public admission, packaging, and disposable Electron proof remain required before enabling Can I Use.
