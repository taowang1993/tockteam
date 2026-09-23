# Fresh Desktop Proof — PASS

Owned production Desktop CDP: `http://127.0.0.1:59194` (run `bd0ec82d-6736-41b9-baa6-04dfc241e3f9`).

## Verified

- TockTutor route: `/tocktutor/Notes/Destination.md`; final UI visibly shows two Destination panes: Reading and Live Preview.
- Dark baseline: CSS viewport `1512×949`, DPR `2`; `colorScheme: dark`; no `data-tockteam-skin`.
- Reading Find: query `formatted` returned `1 note · 1 match` for `Notes/Source.md`; preview rendered inline `<strong>formatted</strong>` and the `Other` navigation link. Clicking the result navigated to Source.
- Focus Mode → Reveal File: focus changed `true → false`; Files sidebar reopened with `Notes/Source.md` selected and status `Revealed Notes/Source.md in Files.`
- Split/merge: split Source and Destination; appended Source into existing Destination, kept Destination property value, moved Source to recoverable trash. Both panes became Destination; no Source pane or Source file remained. Referrer became `[[Notes/Destination]]`.
- Merge Recovery visibly listed `Notes/Source.md → Notes/Destination.md — Applied`.
- Reload: Playwright `page.reload()` returned HTTP `200`; saved merged content and both pane modes persisted.
- Screenshot `/tmp/tutor-final-desktop-proof.png` verified as `3024×1898` PNG.

## Disk evidence

Fixture vault: `/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/pi-extended-display-wntWDf/Review Proof Vault`

- Destination contains the original destination plus Source content and `![[Other]]`.
- `Notes/Source.md` is absent from the live vault.
- Source is recoverable at `.trash/merge-bc3807cb-d06f-4984-9301-96fefe452ec1.md`.
- Merge record status is `applied` in the user-data `tocktutor/merges/.../merge-bc3807cb-d06f-4984-9301-96fefe452ec1.json`.

## Runtime/errors

- Console errors: `0`; page errors observed: `0`.
- Two non-fatal Electron insecure-CSP warnings only: `.playwright-cli/console-2026-09-23T00-17-41-699Z.log`.
- The unrelated TockCoder API-key prompt reappeared after reload; it was dismissed through visible `Configure later` before final TockTutor verification.

## Unverified / boundaries

- Optional replacement Undo isolation from typing in Source and Live Preview was not run within the bounded window.
- Clipboard and OS open/reveal effects were not certified because the fixture intercepts them.

Machine proof: `/tmp/tutor-final-desktop-proof.json`
