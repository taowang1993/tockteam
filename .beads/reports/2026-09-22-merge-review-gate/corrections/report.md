# Review Corrections

Two independent-review findings reproduced and fixed:

1. Completed merge reviews survived changes to unopened files. Existing same-vault entry/tree notifications now abort the current review for any inventory change, since aliases and referrers can change anywhere. The guard is armed after owned dirty saves and removed on cancellation; no polling, extra transport, or broader broadcast was added.
2. cmdk trims explicit command values. Leading-space filenames could lose prepend or select a different file. Commands now have JSON-encoded unique identities, separate exact-path attributes, and whitespace-preserving display. Filenames are not renamed or rejected.

RED: four external-change regressions failed; the three successful-plan/open-referrer dirty/revision/later-edit cases passed. Both leading-space component regressions failed (append instead of prepend; wrong destination). See the RED logs.

Final GREEN:184 focused Node checks and140 component checks, nested build/typecheck, manifest --check and git diff --check pass. An extra delayed-plan test rejects an external change before the reply; owned save events before review preparation remain accepted. Commands are the parent report's focused commands with the same test paths. Root checks were not repeated after these small corrections; the earlier five environmental failures remain unresolved.

A fresh guarded component browser check selected both " Note.md" and "Note.md" via keyboard with prepend and verified their distinct destination content. Geometry1512×949 CSS@2×, built-in dark/no skin, no page errors, unchanged fixture hashes. No replacement screenshots were published. Guard cleanup reported the full recorded tree stopped. This remains component evidence, not production controller/Host/apply evidence.

Reviewer cd80f639 timed out after1200000ms before its final verdict. State/diff were preserved; the same configured reviewer/session was revived through the same protocol as80e63adc-9bba-4c71-8f7a-e9377ce77739 for corrective recheck. The revived reviewer returned No issues found, scoped OK with notes. See review.md; this does not approve the broader dirty worktree or claim shipped merge/apply functionality.
