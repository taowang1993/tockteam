# UUID Generator No-View Check — 2026-09-29

Intermediate child evidence; guarded Desktop and installed-app checks remain pending.

- User-approved sample: MIT-declared `uuid-generator/generate` from Raycast's MIT repository, revision `1063bfaa34be81528c4e397c91b57c42ec370d79`, extension tree `3a6a6008939739c9eb96f5b3e89d6923c404ca3a`. All 19 source blobs (162,328 bytes) matched their pinned Git blob hashes. The repository LICENSE and extension manifest were inspected before the user approved this exact command.
- Built in `/tmp` only: locked `npm ci --ignore-scripts --no-audit --no-fund` installed 223 packages under isolated npm/HOME configuration. Lock SHA-256: `0a2362edbb76721613433193eae5fd782e6afec39d392eb24154c3f5999cdef3`; compiled `generate.js` SHA-256: `b03e0fc82a9020f6f759f9672f20cd93ed2c5f6de9546772150a3adeda78c87e`. No lifecycle or extension script ran before approval.
- Approved local built candidate digest: `3848efd75c448ca016f6eef930ee2d5f9fdcc029750014594b66f2f18684aa3a`. Separately prepared, approved, enabled and invoked through the first-party owned child. Measured: readiness **yes**; command completion **yes**; copied UUIDv4 text through an isolated Host fixture **yes**; HUD feedback **yes**; private persisted history **one entry**. **The real clipboard was not touched.** PID `35965` stopped after completion.
- Focused synthetic checks: two extension identities retain separate managed preferences/history; invoking unsupported `Clipboard.paste` reports an explicit error; cancelling an indefinitely pending command stops the child and descendants. The child is not an OS sandbox: approved code still has the account's file/network/process authority.

Limits: only one selected local built command at a time; only the listed no-view APIs and a single copy request were tested. No real clipboard write, native approval-dialog automation, online catalog, menu, OAuth, or installed-app compatibility is claimed.
