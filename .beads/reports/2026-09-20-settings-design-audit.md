# Settings Design Review

## Design Read

TockTeam's settings are a dense, frequently used product surface. Prioritize readable controls, predictable row behavior, consistent hierarchy, and correct appearance across the built-in themes and four skins. Preserve DSH ownership, shared shadcn components, and Desktop-only authority boundaries.

Audit baseline: `8cf6099b`; actual runtime pin: `dsh-source.json`, DSH `0.1.2-rc.1`. This is an audit, not an implementation change. `.pi/rules/web.md` was read in full and is unchanged.

## Strengths to Preserve

- General, Models, Plugins, and Agent Presets use the inherited DSH settings shell rather than independent navigation systems.
- Side Panel and TockLauncher already use the shared `Switch`; the recent switch contrast, roundness, and motion fixes should remain centralized.
- General, Side Panel, and launcher field labels mostly converge on 14px labels and 12px helper text.
- TockLauncher has a reusable field recipe, labeled controls, save feedback, and explicit reset confirmation.
- The four named skins produced contrasting selection marks and shared primary controls in the inspected states.
- Terminal preferences and TockTutor's assistant are legitimately denser than full settings pages. Do not flatten these differences into a universal layout.

## Coverage

| Surface | Evidence |
| --- | --- |
| General | Live isolated TockTeam Web: Permission, Language, Appearance, Font Size, Conversation Display, TockTeam Skin, and busy-Enter behavior; built-in dark/light; all four skin selections |
| Models | Live isolated Web, initial provider configuration surface, dark/light; pinned component source |
| Plugins | Live isolated Web, expanded Shell/Agent Loop/Web Search configuration and Plugin List, dark/light |
| Agent Presets | Live isolated Web, built-in/custom overview, dark/light; pinned component source |
| Side Panel | Live isolated Web, dark/light, narrow layout; current source and previous focused interaction proof |
| TockLauncher | Actual React page in an isolated browser component harness with in-memory, non-authoritative bridge fixtures; all 16 sections rendered, all disclosures opened; 600px and 375px reflow checks |
| Marketplace Tab | Actual registered React component with a fabricated empty catalog/preview state; keyboard focus and application-theme versus system-theme checks; catalog/detail/approval source inspected |
| Assistant Settings | Actual TockTutor assistant component with fake settings and empty review data; real body portal, workbench-scoped aliases, built-in dark appearance |
| Terminal Font Settings | Source review only: `plugins/panel-controls/src/terminal/TerminalPanel.tsx:176–237` |

TockLauncher sections: Search and History; Appearance and Input; Desktop Lifecycle; Keyboard and Mouse; Browser and Shortcuts; Extensions; Local Transformation Extensions; Discovery Providers; File Search; Terminal Launcher; Workflows; Network Extensions; Storage and Privacy; Security; Updates; About and Contract.

## Findings

| Priority | Class | Evidence | Impact | Governing Layer | Recommendation | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| High | Defect | `plugins/skins/src/client/tailwind.css:40–44`, `plugins/ui/src/button.tsx:10`, `plugins/ui/src/checkbox.tsx:11` | Default primary button text and checked-checkbox marks have **1:1 contrast** in both built-in themes. Dark resolves foreground and fill to `rgb(249, 250, 251)`; light resolves both to `rgb(15, 17, 21)`. Named skins do not reproduce this. The switch fix did not fix the shared primary/brand foreground mapping. Affects launcher actions, checked options, and marketplace primary actions. | Shared semantic token mapping | Establish contrast-safe foreground/fill pairs rather than assuming `brand-primary-invert` means text on `brand-primary`. Keep named-skin intent intact. | Actual shared primitives rendered with pinned DSH theme CSS; settled computed colors in both built-in themes and all four skins. Add a regression for button text and checkbox marks, not just switches. |
| High | Defect | `plugins/tocktutor/packages/tockteam-tocktutor-assistant/src/assistant-panel.tsx:599,623–684`; `plugins/ui/src/popover.tsx:32` | Assistant Settings opens with white panels and near-white inherited text in dark mode. Its body portal cannot inherit the workbench-local `--tt-*` variables. Measured background `rgb(255,255,255)`, text `rgb(249,250,251)`, and empty `--tt-panel`. | Feature's portaled surface | Derive aliases from body-visible DSH semantic tokens at the portal root; preserve text, focus, and state styling there. Do not introduce global TockTutor aliases just to repair a local portal. | Actual assistant popover rendered from the component. Recheck dark/light/all skins, focus, Escape, outside dismissal, and focus restoration after correction. |
| Medium | Defect | `plugins/plugin-marketplace/src/client/plugin.tsx:560–565` | Marketplace search deliberately sets `outline-0`, but its wrapper supplies no replacement focus indicator. The input matches `:focus-visible` while its outline width is 0 and both input/wrapper shadows are `none`. | Feature search-control composition | Restore a tokenized focus-visible outline, or a visible focus-within treatment on the search wrapper. | Browser-focused actual search input; also verify keyboard Tab navigation after correction. |
| Medium | Drift / Defect | `plugins/plugin-marketplace/src/client/plugin.tsx:138,253–280,529–543`; `plugins/skins/src/client/tailwind.css:1–3` | Marketplace status/approval panels use hardcoded palettes and Tailwind `dark:` tied to the **system** media query, not the DSH-selected appearance. With the app held dark, changing only the simulated system scheme changes the preview banner from `rgb(24,39,68)` to `rgb(242,246,255)`. Side Panel's error also hardcodes `#cf222e` at `plugins/sidebar/src/client/plugin.tsx:2014`. | Feature colors and theme integration | Use the existing semantic status/surface tokens. Do not weaken prepare → preview → approve/apply states. If a mode-specific exception remains, explicitly bind it to the application theme. | Actual preview banner with dark app/light system and dark app/dark system; raw-color source review. Test errors, risk levels, and selected/disabled states in all six appearances. |
| Medium | Defect / Coherence Weakness | `plugins/ui/src/input.tsx:16`, `plugins/ui/src/field.tsx:46`, `src/launcher-setting-field.tsx:16–21`, `src/launcher-settings.tsx:390–401` | Shared controls assume browser resets that this Tailwind integration does not import. In the launcher harness, `h-8` inputs render **42px**, small selects **28px**, and 12px field descriptions retain **12px top/bottom UA margins**, producing 91px rows. The Fuzziness range also gets text-input padding/border/height, unlike Side Panel's native range. | Shared primitives, then field/range recipe | Supply the minimal owned box-sizing/margin/native-control resets. Keep range controls out of the text-input geometry recipe. Decide compact versus regular sizes explicitly rather than inheriting browser defaults. | Pinned-theme browser measurements; compare against DSH Models' 32px text inputs. Recheck final Desktop embedding before accepting precise page geometry. |
| Medium | Coherence Weakness | `src/launcher-settings.tsx:126–136,417–492`; `src/launcher-surface-settings.tsx:235–240`; `src/launcher-local-settings.tsx:65`; `src/launcher-file-search-settings.tsx:102`; `src/launcher-network-settings.tsx:69` | Six launcher sections repeat the same heading inside the enclosing section card: Appearance and Input, Keyboard and Mouse, Browser and Shortcuts, Local Transformation Extensions, File Search, and Network Extensions. Several repeat explanatory copy too. This adds vertical noise and duplicates region names for assistive navigation. | Section composition | Let one owner render each section heading/description; embedded bodies should not repeat the outer heading. Preserve meaningful subheadings such as Window Behavior. | Actual page heading inventory. The Appearance and Input locator resolves to two identically named regions. |
| Medium | Defect | `src/launcher-setting-field.tsx:16–21`; `plugins/sidebar/src/client/plugin.tsx:1922`; pinned Agent Presets layout | Wrapping is not sufficient when labels can shrink almost to zero beside controls. At a 375px fixture viewport, Hide Window On's label is about **1.2px** wide; at 600px, Settings Files is about **40.6px**. In the live Web modal at 600px, Side Panel content measures **327px inside 316px** and Agent Presets **324px inside 316px**. | Shared launcher row recipe; separate local/upstream layouts | Stack label and control at a deliberate narrow/container threshold, preserve a readable label measure, and inspect descendant overflow—not just document width. Handle inherited DSH issues through a revision-bound downstream seam or upstream fix. | Rendered widths; no document-wide overflow, which alone would have missed these failures. |
| Medium | Coherence Weakness / Accessibility Gap | `src/launcher-setting-field.tsx:18–19`; contrast with `plugins/sidebar/src/client/plugin.tsx:1930–1940` | Side Panel's visible row label toggles its switch; TockLauncher's visible Search History title does not. Launcher field titles are plain divs, and ordinary helper copy is not linked to controls. Explicit `aria-label` still names the controls, so this is not an unlabeled-control claim. | Shared launcher field recipe | Associate a single field's visible label and help text with its control. Keep multi-control groups as groups rather than pretending the entire row is one label. | Browser click left Search History unchanged; source confirms the title/help relationship is absent. |
| Low | Coherence Weakness | `plugins/sidebar/src/client/plugin.tsx:1922–1928`; pinned Models `lib/client.js:58`, Plugins `:378`, Agent Presets `:804`; `src/launcher-settings.tsx:378–380` | Page titles do not share a hierarchy: Side Panel is a **14px/500 `strong`**, Models **16px/500 `h2`**, Plugins/Agent Presets **18px/600 `h2`**, and TockLauncher **18px/600 `h1`**. Side Panel then jumps to `h4` subsections. Row typography improved, but page-title semantics and weight remain inconsistent. | First-party settings recipe, with explicit DSH compatibility exceptions | Define the first-party page-title/subsection/row hierarchy and semantic heading order. Do not indiscriminately restyle all upstream headings to one size. | Computed styles from live Web and the launcher harness. |

## Does `.pi/rules/web.md` Need Updates?

**Yes—targeted additions, not a rewrite.** Its ownership, token, security, and component guidance is sound, but the current instructions are not precise enough to prevent the failures above.

1. **Add a Settings Composition subsection.** Specify one title/description owner; distinguish page titles, section headings, row labels, and helper text. Record the established 14px/12px first-party row baseline while allowing documented compact popovers. Require associated labels/help and narrow stacking. Do not invent a new global type system.
2. **Document the no-Preflight environment.** The entrypoint imports theme and utilities, not Preflight. Shared controls must own required box sizing, margins, padding, appearance, and font behavior. `h-8` is not evidence of a 32px rendered control. A range input is not a text input.
3. **Clarify foreground/fill pairing.** A token named `*-invert` is not automatically a contrasting foreground. Require measured contrast for primary buttons, checked marks, selected chips, and switch thumbs under the actual pinned theme plus every skin. Avoid “different colors” as the only contrast assertion.
4. **Make portal inheritance explicit.** Portal roots must derive their color aliases from DSH tokens or preserve the owning scope deliberately. Ancestor-only focus rules and feature-local variables do not cross a body portal.
5. **Distinguish application appearance from system appearance.** Bare Tailwind `dark:` currently follows `prefers-color-scheme`. Do not use it for controls expected to follow an explicit DSH theme/skin unless the variant is intentionally integrated. Include opposite-system-theme verification.
6. **Strengthen rendered evidence requirements.** Use real pinned DSH CSS, not a fixture palette that accidentally masks token collisions or native margins. Check computed geometry, contrast, portal placement, focus, and descendant overflow; cover loading/error/selected states. Existing structural tests passing does not establish visual correctness.
7. **Refresh factual details.** The Web composition paragraph at line 66 omits Save as Image (`web/cordis.patch.yml:30`). Record that `data-tockteam-skin` is applied to `body` by `skin-dom.ts:18–29`. The motion section's 120–180ms description should acknowledge the shared switch's explicit 200ms eased transition as an existing component choice, not a new universal duration.

These are proposed edits only. No UI source, `web.md`, or `AGENTS.md` was modified by this audit.

## System-Level Recommendations

Fix in dependency order: contrast-safe shared token pairs and native resets; assistant portal/theme and marketplace focus; launcher row semantics/reflow; duplicate section headers; then optional first-party title alignment. Update the rules alongside the corresponding regression checks so the document describes an enforced contract, not another aspirational checklist.

No new UI framework, animation library, settings engine, or broad redesign is warranted.

## Verification

- Headless, app-scoped Playwright CLI sessions; no foreground OS automation, real credentials, or user profile mutations.
- Live Web used a temporary DSH profile/data root and loopback server. Onboarding was dismissed through Continue → Configure later; no API key was entered.
- Screenshots: **1512 × 949 CSS px at 2×**, verified **3024 × 1898 PNG px**. Canonical captures use explicit dark/light appearance and no active skin. Routes were `/` with Settings open in the Web modal or `/` in the labeled isolated component harness—not a claim of Desktop route verification.
- Named skins were selected through the live General page; shared primitives were separately checked under all six palettes after transitions settled.
- Final live Web evidence: `/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/settings-web-audit-E3wXMd`.
- Final component evidence: `/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/settings-fixture-audit-8MIf3S`.
- Sanitized measurements: `2026-09-20-settings-design-audit.json` beside this report. Screenshots remain in temporary evidence directories; none were published as product baselines.
- Browser/runtime errors: zero in both completed final runs. Full observed browser/runtime process trees stopped; cleanup residue empty.
- `node --test tests/settings-title-case.test.ts tests/settings-boundary.test.ts tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts`: **16/16 passed**. These are structural checks and did not catch the rendered defects.

## Limitations and Unverified

- This inventories all registered main settings pages and the identified embedded settings surfaces, but it is not exhaustive interaction testing of every option or error state.
- No fresh Electron session was launched. Desktop-only surfaces were real components with fake state, not an installed Desktop end-to-end test. Final Desktop shell geometry, native dialogs, IPC, and real marketplace transactions remain unverified.
- Terminal preferences were source-only. Model editing/save flows, custom preset editors, real marketplace catalog/detail plans, all localized/long-content states, and assistive-technology reading order were not exercised exhaustively.
- The full suite/build was not rerun because no product code changed. No implementation claim is made from the passing audit checks.
- A single application-wide heading size would be an optional direction decision, not a prerequisite for correcting contrast, semantics, and layout defects.
