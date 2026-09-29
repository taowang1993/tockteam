# TockTutor Mermaid Reading Proof

- **Route:** `/tocktutor/Drafts/Diagrams.md` in a guarded, isolated Desktop instance on extended display 17. Fixture: `/tmp/tocktutor-imported-properties-proof-20260929/vault/Drafts/Diagrams.md`, SHA-256 `19b04ab4151a42117dc626e3d17c03cc055a181916959c5e548f18d172d055a7`.
- **Geometry:** 1512 × 949 CSS pixels, device scale factor 2; both screenshots 3024 × 1898 pixels.
- **Appearance:** built-in dark (`document.documentElement.style.colorScheme === 'dark'`), no active skin (`document.documentElement.dataset.tockteamSkin === undefined`).
- **Content and safety:** seven rendered images (flowchart, sequence, class, state, ER, pie, Gantt) in Reading View. The eighth fence with an external `click` link remained escaped source. The isolated frame had only `sandbox="allow-scripts"`; all rendered images loaded; zero external requests and zero runtime console errors (two existing framework/Electron warnings).
- **Screenshots:** `2026-09-29-tocktutor-mermaid-reading-dark-top.png` and `2026-09-29-tocktutor-mermaid-reading-dark-pie.png`.
- **Process cleanup:** Playwright detached; guarded Electron root PID 9223 and all 24 recorded PIDs stopped, `remaining:[]`.
- **Verification:** `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/mermaid-browser.test.tsx tests/mermaid-renderer.test.tsx --environment jsdom` (15 passed), `pnpm run typecheck:tocktutor`, `pnpm run build:tocktutor`, `node scripts/tocktutor-build-manifest.mjs --check`, `pnpm run build`, and `node scripts/stage-dsh.mjs --quick` passed at capture time.
