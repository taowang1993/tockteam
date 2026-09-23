# PR feature verifier

**FEATURE: works**

## Note-local Find
- Navigated visibly to `TockTutor` → expanded `Notes` → `Source`; route was `/tocktutor/Notes/Source.md`.
- Switched to **Reading**. Used **More Note Actions → Find…** (note-local `Find in Note`, not vault search).
- Query: `Source formatted phrase.`; observed `1 / 1`.
- DOM observed three inline match fragments (`Source `, `formatted`, ` phrase.`) and `<strong>formatted</strong>` remained around the middle fragment. Screenshot was captured while Find remained open.

## Editable Source mode
Fixture baseline (exact raw editor text): `# Editable\n\nalpha beta alpha\n`.

Actions and exact results:
1. Typed ` BEFORE` → `# Editable\n\nalpha beta alpha\n BEFORE`.
2. **More Note Actions → Replace…**, find `alpha`, replacement `omega`; count `1 / 2`; **Replace All** → `# Editable\n\nomega beta omega\n BEFORE`.
3. Typed ` AFTER` → `# Editable\n\nomega beta omega\n BEFORE AFTER`.
4. Undo ×3 yielded, exactly: after undo 1 `...omega... BEFORE`; undo 2 `...alpha... BEFORE`; undo 3 baseline.
5. Redo ×3 yielded, exactly: `...alpha... BEFORE`; `...omega... BEFORE`; final `...omega... BEFORE AFTER`.

## Editable Live Preview
Switched the same note through the visible mode menu; baseline rendered as `Editable\n\nomega beta omega BEFORE AFTER`.

- Typed ` LIVE_BEFORE`.
- Replace All `omega` → `sigma` (count `1 / 2`) produced `Editable\n\nsigma beta sigma BEFORE AFTER LIVE_BEFORE`.
- Typed ` LIVE_AFTER` → `Editable\n\nsigma beta sigma BEFORE AFTER LIVE_BEFORE LIVE_AFTER`.
- Undo ×3 and redo ×3 matched the corresponding exact intermediate/final strings in the proof JSON.

## Artifacts
- Find-open screenshot (1/1 and bold match visible): `/tmp/tutor-pr-verifier-a4bdb94e-source-find-open.png`
- Source final screenshot: `/tmp/tutor-pr-verifier-a4bdb94e-editable-source-final.png`
- Live Preview final screenshot: `/tmp/tutor-pr-verifier-a4bdb94e-editable-live-final.png`
- Find proof JSON: `/tmp/tutor-pr-verifier-a4bdb94e-proof.json`
- Edit/undo/redo proof JSON: `/tmp/tutor-pr-verifier-a4bdb94e-edit-proof.json`
- Console capture: `/tmp/tutor-pr-verifier-a4bdb94e-console.txt`

All screenshots verified at **3024 × 1898** (CSS viewport 1512 × 949, DPR 2). `document.documentElement.style.colorScheme` was `dark`; `dataset.tockteamSkin` was absent. Page errors: 0. Console errors: 0. One non-error Electron CSP warning was present (`unsafe-eval` development warning).

No save/reload or native effect was certified; the final edit state was intentionally left unsaved for the in-memory undo/redo check.
