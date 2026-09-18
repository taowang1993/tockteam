# Trusted Raycast Translate Desktop — Slice 3 Notes

## Scope completed

Selected language sets (initial from preferences.lang1, legacy single-target migration, source-owned 500 ms
debounce), cached-set persistence across child restarts (main-owned state file), nested LanguagesManager and
AddLanguageForm (Form support), action flows for both languages, selected-text autoInput with honest
unavailable/permission fallback to manual input (never clipboard-as-selection), Paste with captured prior-app
focus and main-owned policy (denial paths honest, clipboard always restored), and TTS exactly per upstream
fire-and-forget `https.get` + `afplay` over the shared `translation.mp3` in the child's private TMPDIR.

Renderer remains a native-DOM finite projection; native effects stay main-owned.

## Child runtime Node contract (TTS gate)

- The trusted Translate child runs on `runtimePaths().nodeBinary` = `<resources-root>/node-runtime/bin/node`.
- Packaged distributions pin `DSH_DESKTOP_NODE_VERSION=24.20.0` (parent-verified packaged runtime).
- This checkout's development stage default is Node 26.0.0 (`scripts/stage-dsh.mjs`), and with Node 26 the
  unchanged source `playTTS` reproducibly stalls: the TTS `https.get` connection opens (lsof shows ESTABLISHED)
  but no response bytes arrive, while translation via axios works and an identical standalone request succeeds.
  Reproduced 3/3 failures on v26 versus 3/3 successes on v24.20.0 with healthy endpoints; not an endpoint
  throttle artifact.
- Action taken: development stage re-staged to Node 24.20.0 (`DSH_DESKTOP_NODE_VERSION=24.20.0 node
  scripts/stage-dsh.mjs`), matching the packaged contract, and a regression pin added in
  `tests/trusted-raycast-build.test.ts` asserting the staged child runtime is Node 24.x with the stall rationale.
- The unchanged source is NOT patched: the TTS implementation is exactly upstream, and the honest contract is
  that the TTS gate requires the Node 24 runtime already used by packaged installs.

## Upstream translate endpoint throttling

Google's free translate endpoint intermittently answered HTTP 429 ("automated queries") during proof runs
after ~40 requests; the child's unchanged source reports this honestly as a "Could not translate" failure
toast and manual input remains. All live-Google Electron evidence below was captured while the endpoint
answered. The Electron proof treats a bounded outside-child TTS probe failure as an upstream outage and
records it instead of faking success.

## Live Desktop/Playwright evidence (13:41 GREEN run, see files in this directory)

- `selection-proof.txt` + in-run assertions: autoInput populated the search input from the dev selection
  fixture; clipboard equality tokens matched before/after (content never logged).
- `language-manager.png`, `add-language-form.png`, `saved-language-set.png`: real dropdown navigation into
  LanguagesManager, nested AddLanguageForm with the reviewed 250-language catalog, target change, submit,
  upstream success toast, saved set visible; Back pops to the translate view.
- `tts-proof.txt`: two real `afplay` processes observed with the private workspace path (repeated TTS on the
  shared upstream filename); `tts-cleanup.txt`: close-during-playback left no afplay and no private temp;
  `final-cleanup.txt`: final close removed its workspace.
- `paste-proof.json`: Paste with a real captured prior app (fixture keystroke only); prior clipboard restored
  (equality tokens matched); first Paste attempt asserted either the honest no-prior-app denial or the
  policy outcome, clipboard preserved in both.
- Ranking `useCount=3` across three successful launches (initial-ready-only ranking).

## Integration evidence (tests/trusted-raycast-native-effects.test.ts, configured)

Real child against the reviewed artifact: language-set select + state-file persistence across restart, legacy
migration, nested manager/form/submit/pop, debounce coalescing, and the full TTS lifecycle (private tmp mp3,
observable afplay, repeated TTS, close-during-playback group/workspace cleanup).
