## Review

Read-only recheck of the three reported findings. Applied all three review-reference perspectives.

**No issues found.**

### Fixed
- **Root dispatch lifetime:** The outlet now receives `noteOwnerKey` without remounting; only note-operation lifetime observes it (`plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx:6124–6128`, `plugins/tocktutor/packages/tockbot-note-desktop/src/client-actions.tsx:758–767`). The regression exercises genuine controller selection and verifies pop-out dispatch completes without cancellation.
- **Recording concurrency:** Note resets clear only pending note-action state. Synchronous startup and active-recording guards prevent overlapping recordings (`client-actions.tsx:761–765,870–910`, same Desktop package). The regression verifies disabled startup across draft edits, one media acquisition and track cleanup.
- **Success feedback:** Default-app opening now reports “Opened in the default app.” while preserving pop-out wording (`client-actions.tsx:785–787`). The success test asserts it.

Save failures and late-result handling retain their signal checks.

### Verification
- **Inspected:** Changed source, regression tests, `/tmp/tutor-open-review-red.txt` showing all three reproduced failures, and `/tmp/tutor-open-review-green.txt` showing **35 tests passed**.
- **Not executed by me:** Tests, builds, typechecks or GUI verification.
- **Parent-reported only:** Pre-fix typechecks passed; initial root suite had 1,367 passes, five reported known EPERM failures and 18 skips.
- **Pending:** Final post-fix verification and guarded Desktop proof. No actual OS-association launch was verified.

**Merge verdict: OK with notes**