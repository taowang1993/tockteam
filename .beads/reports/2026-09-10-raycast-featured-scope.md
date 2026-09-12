# Raycast Featured Scope Decision

On 2026-09-10, the user explicitly selected **Use the Featured List** as the final epic scope. This supersedes the original Recommended-membership requirement; it does not establish that Featured and Recommended are equivalent.

## Official Membership

Source: <https://www.raycast.com/store>, retrieved on 2026-09-10. The page labels this collection **Featured**, with the helper text “Our top picks to get you started.”

| Extension | Raycast-Owned Page | Current Disposition |
| --- | --- | --- |
| Kaomoji Search | <https://www.raycast.com/yalishanda/kaomoji-search> | Supported; `tockteam-3l3.3` closed |
| Can I Use | <https://www.raycast.com/thomaslombart/can-i-use> | Integration in progress; `tockteam-3l3.4` open |
| Mole | <https://www.raycast.com/jlrochin/mole> | Excluded; security-design task `tockteam-3l3.5` closed, not working runtime support |

The full retrieved Markdown remains at `/private/tmp/tockteam-can-i-use-root-bridge-r1.XsioBP/current-raycast-store.md`, SHA-256 `294948f6aaff385f5a545aab78bd909d149efd984deda24f82488232e3caa05f`. Public membership is point-in-time evidence; subsequent Store changes do not silently enlarge this approved trio.

## Tracker Changes

- `tockteam-3l3`: renamed **Support Raycast Featured Extensions**; acceptance now uses the evidenced trio and explicit support/exclusion dispositions.
- `tockteam-3l3.2`: renamed **Verify Official Featured Membership** and closed against the new user-approved criterion. Earlier unsuccessful Recommended searches remain in its history.
- Remaining Can I Use work is unchanged: manager/child integration and visible counts (`.4.2`), authenticated details/actions and preference lifecycle (`.4.3`), final packaged Electron verification (`.4.4`). The parent feature `.4` and epic remain unfinished.

## Unchanged Limits

No new execution, binary, filesystem, cleanup, elevation, updater, foreground-input, or push authority is granted by this scope decision. Translate and Kaomoji must remain intact. Source-level Can I Use tests do not substitute for actual Launcher or Electron verification. Mole's exclusion is documented in [its security contract](2026-09-10-mole-security-contract.md); no unsupported operation may report success.

This is a documentation/acceptance change only; no new implementation test is needed.
