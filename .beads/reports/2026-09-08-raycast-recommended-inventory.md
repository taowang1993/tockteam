# Raycast Recommended Extension Inventory and Compatibility Matrix

**Snapshot date:** 2026-09-08  
**Scope:** Raycast's current official collection explicitly named **Recommended**  
**Beads:** `tockteam-3l3`, `tockteam-3l3.1`

## Executive Conclusion

No current, publicly verifiable Raycast-owned source identifies a collection named **Recommended** or exposes its members. The defensible inventory is therefore **zero verified members / membership undetermined**, not a substitution from Featured, Most Popular, Recently Added, sponsored listings, general Store entries, or an older source sample.

This is an admission stop gate:

- no new extension artifact is authorized;
- no first implementation tranche can be selected without guessing;
- the already reviewed Google Translate compatibility extension remains supported under its existing explicit artifact approval, but its current Recommended membership is **unverified**;
- the current official Featured entries are recorded below only to make their exclusion auditable.

## Definition Applied

An extension counts only when a current Raycast-owned page, badge, API field, or equivalent first-party record explicitly establishes membership in **Recommended**. These signals do **not** qualify:

- Featured placement;
- install count or Most Popular placement;
- Recently Added placement;
- sponsorship or editorial mention;
- presence in `raycast/extensions`;
- the prior ten-extension research sample;
- a successful response from a catch-all URL without a Recommended label.

## Authoritative Retrieval Evidence

| Raycast-Owned Surface | Observation | Decision |
| --- | --- | --- |
| [Raycast Store](https://www.raycast.com/store) | The current curated section is labeled **Featured** with the description **“Our top picks to get you started.”** Navigation exposes **All Extensions**, **Recently Added**, and **Most Popular**. Retrieved HTML had no Recommended label. | Does not establish Recommended membership. |
| [`/store/recommended`](https://www.raycast.com/store/recommended) | Returned the normal Store page and canonicalized to `/store`; no Recommended heading, badge, collection, or members appeared. | Catch-all success is not membership evidence. |
| [Public Store API](https://www.raycast.com/frontend_api/extensions) | Default response reported `total_results: 3253` and exposed general extension/source metadata, but no recommendation or collection-membership field. | General Store data is not Recommended membership. |
| Undocumented API probes | `?recommended=true`, `?collection=recommended`, `?featured=true`, and `?is_recommended=true` returned the same default records and total. | Negative retrieval evidence only; these parameters are not documented. |
| Installed Raycast app and local data | Raycast is installed locally, but its application databases were not readable as ordinary SQLite. The app was not activated, focused, automated, or asked to decrypt private data. | No app-only membership claim can be made. |

A private, authenticated, experiment-specific, app-only, or retired collection may exist. This audit does not prove otherwise; it records that no current authoritative membership list was safely retrievable.

## Official Recommended Inventory

| Verified Members | Membership Evidence | Stable Artifact Identity | Admission |
| --- | --- | --- | --- |
| **None (0)** | No current public Raycast-owned Recommended collection or member record was found. | None | **Blocked** |

“None” here means **none publicly verifiable**, not proof that Raycast has never used or does not privately use the term.

## Official Entries Observed but Excluded

The Store currently presents these as **Featured**, not Recommended.

| Extension | Author | Raycast Store Record | Stable IDs | Current Official Source Snapshot | Why Excluded |
| --- | --- | --- | --- | --- | --- |
| Kaomoji Search | Alexander Ignatov (`yalishanda`) | [Store](https://www.raycast.com/yalishanda/kaomoji-search) | Extension `da34e506-4642-4a96-b1dc-56477312f1b1`; author `6980f44a-f570-4d1c-9df5-6231c2ffe677` | [`b7845053e3f39dadcf984217be5249fb51ab2ce8`](https://github.com/raycast/extensions/tree/b7845053e3f39dadcf984217be5249fb51ab2ce8/extensions/kaomoji-search/) | Featured is not Recommended. |
| Can I Use | Thomas Lombart (`thomaslombart`) | [Store](https://www.raycast.com/thomaslombart/can-i-use) | Extension `cd8f452c-6af1-4da5-ae84-d0d7e2535218`; author `2e9fabe2-f70f-4907-9bed-b78ea4bde44b` | [`186d955eda64f9e956b25a3fdf5566b1d38f57f2`](https://github.com/raycast/extensions/tree/186d955eda64f9e956b25a3fdf5566b1d38f57f2/extensions/can-i-use/) | Featured is not Recommended. |
| Mole | jlrochin (`jlrochin`) | [Store](https://www.raycast.com/jlrochin/mole) | Extension `76ff4c05-b41a-4e87-9136-f8dffdf5b2c4`; author `380dfc0e-7b13-4ce8-b7b5-489b629b99ea` | [`8a4409d03a593ea0b69b825b525c80753102a379`](https://github.com/raycast/extensions/tree/8a4409d03a593ea0b69b825b525c80753102a379/extensions/mole/) | Featured is not Recommended. |

These source commits are inventory metadata, not approved TockTeam artifacts. No candidate extension artifacts were downloaded, installed, executed, or admitted; only Store, API, and source metadata was retrieved.

## Compatibility, API, and Security Matrix

| Row | Commands and UI Primitives | Effects and Trust Surface | TockLauncher Coverage | Exact-Artifact State | Decision |
| --- | --- | --- | --- | --- | --- |
| Verified Recommended set | No verified members, manifests, or commands. | None available to review. | No implementation target. | No candidate artifact. | **Stop.** |
| Google Translate — existing baseline, current membership unverified | Existing approved command remains exact manifest command `translate`; List/Form projection, dropdowns, actions, EmptyView, preferences, Clipboard/Paste, browser, selected text, and TTS are already covered. The [current Store source snapshot](https://github.com/raycast/extensions/tree/a5090e97075f2e65e331127456797d9561b5e2b0/extensions/google-translate/) advertises additional commands, but those are outside the approved artifact; see its [Store record](https://www.raycast.com/gebeto/translate). | Sends text to Google Translate; optional proxy; selected-text and Clipboard/Paste effects; temporary TTS audio and bounded `afplay`. No arbitrary RPC or renderer authority. The approved child remains trusted local code and is **not** filesystem, network, or process confined; see the [third-party notice](../../THIRD_PARTY_NOTICES.md). | Implemented and visually proven at 750×475 in dark/light under the prior pilot. | **Approved existing tar only:** `plugins/trusted-raycast/vendor/google-translate.tar`, SHA256 `7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac`, source pin `1063bfaa34be81528c4e397c91b57c42ec370d79`. Current Store source snapshot [`a5090e97075f2e65e331127456797d9561b5e2b0`](https://github.com/raycast/extensions/tree/a5090e97075f2e65e331127456797d9561b5e2b0/extensions/google-translate/) is **not approved**. | Preserve existing support; do not relabel or refresh from current Store without explicit review and approval. |
| Kaomoji Search — Featured only | One List/Grid-style command; search, grouped items, favorites/recents, Copy or Paste action. | Bundled local data and local persistence; Clipboard/Paste side effects; no account/native process evidenced in the inspected source metadata. | Shared List, sections, search, actions, Clipboard/Paste, and persistence primitives provide high apparent coverage. | No reviewed candidate tar/hash. | **Excluded.** No implementation tranche despite apparent coverage. |
| Can I Use — Featured only | One List command; accessories, pushed Detail, browser action, Browserslist/project preferences. | Bundled `caniuse-lite`; configured local project-path reads; browser navigation/network; no account flow evidenced. | List, Detail, actions, preferences, and bounded browser effects partially exist; project-path scope needs an explicit Host contract. | No reviewed candidate tar/hash. | **Excluded.** Membership and artifact admission both missing. |
| Mole — Featured only | Ten List/menu-bar/native commands for status, clean, optimize, uninstall, purge, analyze, installers, sudo Touch ID, and update. | External executable trust, destructive filesystem effects, possible elevation, sudo configuration mutation, update/network behavior, and macOS-only operation. | Existing finite native actions do not authorize a generic external binary or destructive/elevated command surface. | No reviewed candidate tar/hash. | **Excluded and high risk.** Would require a dedicated security design even if membership were later proven. |

## Shared Host Primitive Decision

The highest apparent compatibility coverage belongs to Kaomoji Search because its UI/effects largely overlap existing bounded List, section, search, action, Clipboard/Paste, and preference primitives. It is **not** an authorized tranche: current official evidence classifies it as Featured only.

No shared Raycast API primitive or extension-specific exception should be implemented speculatively. The next code tranche starts only after authoritative membership evidence identifies at least one extension and exact candidate bytes pass the established prepare → pinned candidate → isolated preview → explicit approval/apply process.

## UI Evidence Matrix

| Target | Authoritative Reference | Theme/Geometry Coverage | Current Comparison Status |
| --- | --- | --- | --- |
| Verified Recommended members | None because no members were verified. | None. | No comparison target. |
| Existing Google Translate baseline | Official repository metadata at source pin [`1063bfaa…`](https://github.com/raycast/extensions/tree/1063bfaa34be81528c4e397c91b57c42ec370d79/extensions/google-translate/metadata), plus prior direct Raycast parity captures under `.beads/reports/trusted-raycast-desktop/parity/`. | Official metadata is a 2000×1250 desktop composite and primarily dark; direct prior parity evidence supplies command states. TockLauncher evidence uses real 750×475 dark/light geometry. | Already implemented and proven; membership remains unverified. |
| Current Featured entries | Current official Store cards establish Featured placement only. | Store marketing cards do not establish equivalent 750×475 command states. | Not compared or implemented because they are excluded from the Requested collection. |

Raycast repository metadata screenshots are visual references, not viewport specifications. They are desktop composites with no declared command-window crop and often cover one theme only. Loading, empty, error, preference, OAuth, permission, and keyboard-focus states cannot be inferred when absent.

## Stop Gate and Required Unblocker

**First implementation tranche: not authorized.** Proceed only when one of these is available:

1. a current Raycast-owned page or in-app capture that explicitly labels the Recommended collection and shows its members;
2. a documented Raycast API response with an explicit Recommended membership field;
3. direct Raycast-owned clarification that **Featured** is the renamed/equivalent successor to **Recommended**.

The evidence must be captured without stealing OS focus or using global cursor/keyboard automation. After membership is known, each candidate still requires a separate exact source/artifact pin, dependency/integrity/license review, security matrix, isolated preview, explicit approval, TDD, and dark/light 750×475 comparison.

## Research Reliability Notes

- The initial delegated source-matrix lane failed because its child runtime lacked the advertised web tools. It produced no matrix and was not used as evidence.
- The lane was retried through the same subagent protocol with a web-capable agent; the bounded retry produced the matrix summarized here.
- Two web-research lanes required supervisor intervention to stop long-running searches and finalize from already collected evidence. Their conclusions agree on the membership stop gate.
- An Exa MCP config accidentally created in the repository by a delegated child was identified from that child's transcript and removed; no research runtime file remains in the worktree.

## Sources

- [Raycast Store](https://www.raycast.com/store)
- [Raycast `/store/recommended` path](https://www.raycast.com/store/recommended)
- [Raycast Most Popular](https://www.raycast.com/store/popular)
- [Raycast Recently Added](https://www.raycast.com/store/recent)
- [Raycast public extension API](https://www.raycast.com/frontend_api/extensions)
- [Raycast UI overview](https://developers.raycast.com/api-reference/user-interface)
- [Raycast List](https://developers.raycast.com/api-reference/user-interface/list)
- [Raycast Form](https://developers.raycast.com/api-reference/user-interface/form)
- [Raycast Detail](https://developers.raycast.com/api-reference/user-interface/detail)
- [Raycast Grid](https://developers.raycast.com/api-reference/user-interface/grid)
- [Raycast Action Panel](https://developers.raycast.com/api-reference/user-interface/action-panel)
- [Raycast Menu Bar commands](https://developers.raycast.com/api-reference/menu-bar-commands)
